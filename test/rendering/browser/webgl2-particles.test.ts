/**
 * WebGL2 ParticleSystem browser tests.
 *
 * Validates the `@codexo/exojs-particles` WebGl2ParticleRenderer end-to-end:
 * a particle spawned with a fixed slot, position, scale and packed color is
 * rendered to a real WebGL2 canvas and read back with `gl.readPixels`.
 *
 * Determinism note: `ParticleSystem` has no built-in RNG - spawn/update
 * modules (which may use distributions) are entirely optional. These tests
 * bypass spawn modules altogether and write the SoA arrays
 * through `system.emit()`, then render without ever calling `system.update()` - so
 * `elapsed` stays at 0 and the particle never expires. This yields fully
 * deterministic, seed-free particle placement across runs.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { MeshParticles, particlesExtension, ParticleSystem, RibbonParticles } from '../../../packages/exojs-particles/src/index';
import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// The particle GLSL is the shipped `.vert`/`.frag` text, loaded by the shader
// plugin. This spec renders the stock particle stage, so it must not carry its
// own copy of those sources: a copy silently goes stale the next time the
// shipped shader changes and the spec then tests a shader nobody ships.

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          antialias: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);
  // The particle renderer is not part of the core renderer bindings - the
  // `@codexo/exojs-particles` package materialises it itself via its
  // Extension descriptor. Browser tests construct a bare backend (bypassing
  // Application), so the particle binding must be wired explicitly, same as
  // `wireCoreRenderers` does for Sprite/Mesh/Text.
  materializeRendererBindings(backend, particlesExtension.renderers!);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

/** A 16×16 texture, red in its left half and blue in its right half. */
const createSplitTexture = (): Texture => {
  const src = document.createElement('canvas');

  src.width = 16;
  src.height = 16;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 8, 16);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(8, 0, 8, 16);

  return new Texture(src);
};

/**
 * A right triangle spanning ±16 system-local units with the right angle at its
 * top-left corner, UVs running 0..1 across its bounding box. Non-indexed, so
 * the instanced draw derives its vertex count from the mesh itself.
 */
const createTriangleMesh = (): Geometry =>
  new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_uv', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    // prettier-ignore
    vertexData: new Float32Array([
      -16, -16, 0, 0,
       16, -16, 1, 0,
      -16,  16, 0, 1,
    ]),
    stride: 16,
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 ParticleSystem — solid color', () => {
  test('a spawned particle renders at its fixed position, clear color elsewhere', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4 });

    try {
      // Deterministic placement: bypass spawn modules and emit one particle at
      // its defaults. `lifetime` only matters if `update()` is called - it never
      // is here, so the particle can't expire.
      system.emit();
      // Position the system itself so the particle (system-local quad
      // centered on 0,0, half-extent 8px for a 16x16 texture) lands at
      // (32, 32), well clear of the canvas edges.
      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      // Interior of the particle quad (32,32 ± 8px) should be red.
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 28, 28), [255, 0, 0, 255]);
      // A safely particle-free corner remains the clear color (black).
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 60, 60), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('two systems share one compiled program, and destroying one leaves the other drawing', async () => {
    const backend = await createBackend();
    const redTexture = createSolidTexture('#ff0000', 16, 16);
    const greenTexture = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const first = new ParticleSystem(redTexture, { capacity: 4 });
    const second = new ParticleSystem(greenTexture, { capacity: 4 });

    const place = (system: ParticleSystem, x: number, y: number): void => {
      system.emit();
      system.setPosition(x, y);
      root.addChild(system);
    };

    try {
      place(first, 16, 16);
      render(backend, root);

      // Everything the particle path compiles lazily is compiled by now, so any
      // further program creation belongs to the second system alone.
      const createProgram = vi.spyOn(backend.context, 'createProgram');

      place(second, 48, 48);
      render(backend, root);

      // Both systems default to the shared render mode, whose material is what
      // the renderer caches its program, VAO and buffers against - so the second
      // system must reuse the first system's program rather than compile its own.
      expect(createProgram).not.toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 255, 0, 255]);

      // The shared mode is not owned by any one system, so destroying the first
      // must not tear down the resources the second still draws with.
      first.destroy();
      render(backend, root);

      expect(createProgram).not.toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 0, 0, 255]);

      createProgram.mockRestore();
    } finally {
      root.destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('particle color channel tints a white texture', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4 });

    try {
      const particle = system.emit()!;

      particle.color = new Color(0, 255, 0).toRgba8();
      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGL2 ParticleSystem — ribbon', () => {
  test('a chain of particles renders as one connected band', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    // The ribbon mode ships its own shader pair, which only a real backend ever
    // compiles - a broken one draws nothing and fails the interior assertions
    // below rather than passing silently in the node lanes.
    const system = new ParticleSystem(texture, { capacity: 8, render: new RibbonParticles({ width: 12 }) });

    try {
      // Three particles on a horizontal line, system-local. The strip expands
      // ±6px around it, so at (32, 32) it covers x 16..48, y 26..38.
      for (const x of [-16, 0, 16]) {
        const particle = system.emit()!;

        particle.position.x = x;
        particle.color = new Color(0, 255, 0).toRgba8();
      }

      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      // Along the band: both ends and the middle are filled, which a
      // strip-that-drew-only-one-segment would not satisfy.
      expectPixelNear(readWebGl2Pixel(backend, 20, 32), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 44, 32), [0, 255, 0, 255]);
      // Across it: the band is a band, not the whole column.
      expectPixelNear(readWebGl2Pixel(backend, 32, 12), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 32, 52), [0, 0, 0, 255]);
      // Past the ends of the path, and a safely empty corner.
      expectPixelNear(readWebGl2Pixel(backend, 58, 32), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('the strip tapers with the per-particle scale', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 8, render: new RibbonParticles({ width: 20 }) });

    try {
      // Half-width runs from 10px at the head down to 1px at the tail, which is
      // what `ScaleOverLifetime` drives in a real scene.
      const scales = [1, 0.1];

      for (let i = 0; i < scales.length; i++) {
        const particle = system.emit()!;

        particle.position.x = i === 0 ? -16 : 16;
        particle.scale.x = scales[i]!;
        particle.color = new Color(0, 255, 0).toRgba8();
      }

      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      // Wide end: 8px off the centre line is still inside the band.
      expectPixelNear(readWebGl2Pixel(backend, 17, 25), [0, 255, 0, 255]);
      // Narrow end: the same offset is outside it, while the centre is not.
      expectPixelNear(readWebGl2Pixel(backend, 47, 25), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 47, 32), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGL2 ParticleSystem — mesh', () => {
  test('a particle draws the supplied mesh, sampling its frame through the mesh UVs', async () => {
    const backend = await createBackend();
    const texture = createSplitTexture();
    const mesh = createTriangleMesh();
    const root = new Container();
    // The mesh mode bakes its own shader pair around the geometry, which only a
    // real backend ever compiles - a broken one draws nothing and fails the
    // interior assertions below rather than passing silently in the node lanes.
    const system = new ParticleSystem(texture, { capacity: 4, render: new MeshParticles({ geometry: mesh }) });

    try {
      system.emit();
      // At (32, 32) the triangle covers x 16..48, y 16..48 below the diagonal
      // running from (48, 16) to (16, 48).
      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      // Inside, left of the mesh's own UV midpoint: samples the texture's red half.
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);
      // Inside, right of it: samples the blue half. Both together prove the mesh
      // UVs reach the sampler rather than the quad's corner UVs.
      expectPixelNear(readWebGl2Pixel(backend, 38, 18), [0, 0, 255, 255]);
      // Inside the mesh's bounding box but past its hypotenuse - the assertion a
      // mesh drawn as a quad would fail.
      expectPixelNear(readWebGl2Pixel(backend, 44, 44), [0, 0, 0, 255]);
      // A safely mesh-free corner remains the clear color.
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('the per-particle scale and rotation drive the mesh', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const mesh = createTriangleMesh();
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4, render: new MeshParticles({ geometry: mesh }) });

    try {
      const particle = system.emit()!;

      particle.scale.set(0.5, 0.5);
      // 180 degrees puts the right angle at the bottom-right instead of the top-left.
      particle.rotation = 180;
      particle.color = new Color(0, 255, 0).toRgba8();

      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      // Half scale: the mesh now spans ±8, so the far corner of the unscaled
      // footprint is empty while the rotated interior is filled.
      expectPixelNear(readWebGl2Pixel(backend, 38, 38), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 26, 26), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 20, 32), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGL2 ParticleSystem — mesh mutation', () => {
  test('an in-place edit to the mesh reaches the GPU on the next draw', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff');
    const mesh = createTriangleMesh();
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4, render: new MeshParticles({ geometry: mesh }) });

    try {
      const particle = system.emit()!;

      particle.color = new Color(0, 255, 0).toRgba8();
      system.setPosition(32, 32);
      root.addChild(system);

      render(backend, root);

      // The right angle sits top-left, so the near corner is filled and the far
      // one is past the hypotenuse.
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 44, 44), [0, 0, 0, 255]);

      // Flip the triangle so the right angle sits bottom-right instead. The two
      // sample points swap roles, which no stale buffer can reproduce.
      const vertices = mesh.vertexData as Float32Array;

      vertices.set([16, 16, 1, 1, -16, 16, 0, 1, 16, -16, 1, 0]);
      mesh.invalidate();

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 44, 44), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
