/**
 * WebGPU ParticleSystem browser tests — opt-in, capability-aware.
 *
 * Validates the `@codexo/exojs-particles` WebGpuParticleRenderer end-to-end:
 * a particle spawned with a fixed slot, position, scale and packed color is
 * rendered to a real WebGPU canvas and read back via a 2D-canvas snapshot.
 *
 * Determinism note: `ParticleSystem` has no built-in RNG — spawn/update
 * modules (which may use distributions) are entirely optional. These tests
 * bypass spawn modules altogether and write the SoA arrays
 * (`posX`/`posY`/`scaleX`/`scaleY`/`color`/`lifetime`) directly after calling
 * `system.spawn()`, then render without ever calling `system.update()` — so
 * `elapsed` stays at 0 and the particle never expires. This yields fully
 * deterministic, seed-free particle placement across runs.
 *
 * The renderer itself draws from the render mode's inline WGSL, but the mode's
 * `Material` pairs that WGSL with the shipped GLSL, which the shader-stub
 * plugin blanks — and `ShaderSource` rejects empty GLSL. So this spec does
 * depend on `_glslMocks.ts` restoring the package's `.vert`/`.frag` sources,
 * even though nothing here compiles them.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Time } from '#core/Time';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { ApplyForce, MeshParticles, particlesExtension, ParticleSystem, RibbonParticles } from '../../../packages/exojs-particles/src/index';
import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();
  // The particle renderer is not part of the core renderer bindings — the
  // `@codexo/exojs-particles` package materialises it itself via its
  // Extension descriptor. Browser tests construct a bare backend (bypassing
  // Application), so the particle binding must be wired explicitly, same as
  // `wireCoreRenderers` does for Sprite/Mesh/Text.
  materializeRendererBindings(backend, particlesExtension.renderers);

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

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

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU ParticleSystem — solid color', () => {
  test('a spawned particle renders at its fixed position, clear color elsewhere', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4 });

    try {
      // Deterministic placement: bypass spawn/update modules entirely and
      // write the SoA slot directly. `lifetime` only matters if `update()`
      // is called — it never is here, so the particle can't expire.
      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 1;
      system.scaleY[slot] = 1;
      system.rotations[slot] = 0;
      system.color[slot] = 0xffffffff; // opaque white — no tint, texture color passes through
      system.lifetime[slot] = 1;

      // Position the system itself so the particle (system-local quad
      // centered on 0,0, half-extent 8px for a 16x16 texture) lands at
      // (32, 32), well clear of the canvas edges.
      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Interior of the particle quad (32,32 ± 8px) should be red.
      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(28, 28), [255, 0, 0, 255]);
      // A safely particle-free corner remains the clear color (black).
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
      expectPixelNear(readPixel(60, 60), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('particle color channel tints a white texture', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4 });

    try {
      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 1;
      system.scaleY[slot] = 1;
      system.color[slot] = new Color(0, 255, 0).toRgba();
      system.lifetime[slot] = 1;

      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(32, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU ParticleSystem — ribbon', () => {
  test('a chain of particles renders as one connected band', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const root = new Container();
    // The ribbon mode ships its own WGSL, which only a real device ever
    // compiles — a broken module draws nothing and fails the interior
    // assertions below rather than passing silently in the node lanes.
    const system = new ParticleSystem(texture, { capacity: 8, render: new RibbonParticles({ width: 12 }) });

    try {
      // Three particles on a horizontal line, system-local. The strip expands
      // ±6px around it, so at (32, 32) it covers x 16..48, y 26..38.
      for (const x of [-16, 0, 16]) {
        const slot = system.spawn();

        system.posX[slot] = x;
        system.posY[slot] = 0;
        system.scaleX[slot] = 1;
        system.scaleY[slot] = 1;
        system.color[slot] = new Color(0, 255, 0).toRgba();
        system.lifetime[slot] = 1;
      }

      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Along the band: both ends and the middle are filled, which a
      // strip-that-drew-only-one-segment would not satisfy.
      expectPixelNear(readPixel(20, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(32, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(44, 32), [0, 255, 0, 255]);
      // Across it: the band is a band, not the whole column.
      expectPixelNear(readPixel(32, 12), [0, 0, 0, 255]);
      expectPixelNear(readPixel(32, 52), [0, 0, 0, 255]);
      // Past the ends of the path, and a safely empty corner.
      expectPixelNear(readPixel(58, 32), [0, 0, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU ParticleSystem — mesh', () => {
  test('a particle draws the supplied mesh, sampling its frame through the mesh UVs', async ctx => {
    const backend = await setupBackend();

    const texture = createSplitTexture();
    const mesh = createTriangleMesh();
    const root = new Container();
    // The mesh mode bakes its own WGSL around the geometry, which only a real
    // device ever compiles — a broken module draws nothing and fails the
    // interior assertions below rather than passing silently in the node lanes.
    const system = new ParticleSystem(texture, { capacity: 4, render: new MeshParticles({ geometry: mesh }) });

    try {
      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 1;
      system.scaleY[slot] = 1;
      system.rotations[slot] = 0;
      system.color[slot] = 0xffffffff; // opaque white — texture color passes through
      system.lifetime[slot] = 1;

      // At (32, 32) the triangle covers x 16..48, y 16..48 below the diagonal
      // running from (48, 16) to (16, 48).
      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Inside, left of the mesh's own UV midpoint: samples the texture's red half.
      expectPixelNear(readPixel(24, 24), [255, 0, 0, 255]);
      // Inside, right of it: samples the blue half. Both together prove the mesh
      // UVs reach the sampler rather than the quad's corner UVs.
      expectPixelNear(readPixel(38, 18), [0, 0, 255, 255]);
      // Inside the mesh's bounding box but past its hypotenuse — the assertion a
      // mesh drawn as a quad would fail.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
      // A safely mesh-free corner remains the clear color.
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('the per-particle scale and rotation drive the mesh', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const mesh = createTriangleMesh();
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4, render: new MeshParticles({ geometry: mesh }) });

    try {
      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 0.5;
      system.scaleY[slot] = 0.5;
      // 180° puts the right angle at the bottom-right instead of the top-left.
      system.rotations[slot] = 180;
      system.color[slot] = new Color(0, 255, 0).toRgba();
      system.lifetime[slot] = 1;

      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Half scale: the mesh now spans ±8, so the far corner of the unscaled
      // footprint is empty while the rotated interior is filled.
      expectPixelNear(readPixel(38, 38), [0, 255, 0, 255]);
      expectPixelNear(readPixel(26, 26), [0, 0, 0, 255]);
      expectPixelNear(readPixel(20, 32), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU ParticleSystem — mesh on the GPU compute path', () => {
  test('a mesh system runs its simulation on the GPU and draws from the compute output', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const mesh = createTriangleMesh();
    const root = new Container();
    // Handing the system the backend's own device puts it on the GPU path at
    // the first update, so the compute pipeline compiles for real and writes
    // the instance buffer this draw binds directly. The mesh mode declares the
    // layout that pipeline emits; if it did not, nothing would land here.
    const system = new ParticleSystem(texture, {
      capacity: 4,
      device: getBackendDevice(backend),
      render: new MeshParticles({ geometry: mesh }),
    });

    try {
      system.addUpdateModule(new ApplyForce(0, 0));

      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 1;
      system.scaleY[slot] = 1;
      system.rotations[slot] = 0;
      system.color[slot] = new Color(0, 255, 0).toRgba();
      system.lifetime[slot] = 10;

      system.setPosition(32, 32);
      root.addChild(system);

      // The system tears its GPU state down the first time it sees a backend
      // it has not been collected against, so the first frame is always the
      // CPU path. Render once to bind the backend, then update again — that
      // second update is the one that compiles the compute pipeline.
      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      system.update(Time.zero.clone().set(16));

      expect(system.gpuMode).toBe(true);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // The same triangle the CPU path draws, this time expanded from an
      // instance record the compute shader packed.
      expectPixelNear(readPixel(24, 24), [0, 255, 0, 255]);
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
