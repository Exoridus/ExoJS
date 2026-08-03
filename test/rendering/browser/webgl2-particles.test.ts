/**
 * WebGL2 ParticleSystem browser tests.
 *
 * Validates the `@codexo/exojs-particles` WebGl2ParticleRenderer end-to-end:
 * a particle spawned with a fixed slot, position, scale and packed color is
 * rendered to a real WebGL2 canvas and read back with `gl.readPixels`.
 *
 * Determinism note: `ParticleSystem` has no built-in RNG — spawn/update
 * modules (which may use distributions) are entirely optional. These tests
 * bypass spawn modules altogether and write the SoA arrays
 * (`posX`/`posY`/`scaleX`/`scaleY`/`color`/`lifetime`) directly after calling
 * `system.spawn()`, then render without ever calling `system.update()` — so
 * `elapsed` stays at 0 and the particle never expires. This yields fully
 * deterministic, seed-free particle placement across runs.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { particlesExtension, ParticleSystem } from '../../../packages/exojs-particles/src/index';
import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

const shaderSources = vi.hoisted(() => ({

  // Verbatim copy of packages/exojs-particles/src/renderers/glsl/particle.vert
  particleVert: `#version 300 es
precision lowp float;
precision lowp int;

layout(location = 0) in vec2 a_translation;
layout(location = 1) in vec2 a_scale;
layout(location = 2) in float a_rotation;
layout(location = 3) in vec4 a_color;
layout(location = 4) in vec2 a_uvMin;
layout(location = 5) in vec2 a_uvMax;

uniform mat3 u_projection;
uniform mat3 u_systemTransform;
uniform vec4 u_localBounds;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    int vid = gl_VertexID;
    int cornerX = ((vid + 1) >> 1) & 1;
    int cornerY = vid >> 1;

    float localX = (cornerX == 0) ? u_localBounds.x : u_localBounds.z;
    float localY = (cornerY == 0) ? u_localBounds.y : u_localBounds.w;

    vec2 rotation = vec2(sin(radians(a_rotation)), cos(radians(a_rotation)));
    vec2 transformed = vec2(
        (localX * (a_scale.x * rotation.y)) + (localY * (a_scale.y * rotation.x)),
        (localX * (a_scale.x * -rotation.x)) + (localY * (a_scale.y * rotation.y))
    );

    vec3 worldPos = vec3(transformed + a_translation, 1.0);

    gl_Position = vec4((u_projection * u_systemTransform * worldPos).xy, 0.0, 1.0);

    float u = (cornerX == 0) ? a_uvMin.x : a_uvMax.x;
    float v = (cornerY == 0) ? a_uvMin.y : a_uvMax.y;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}`,

  // Verbatim copy of packages/exojs-particles/src/renderers/glsl/particle.frag
  particleFrag: `#version 300 es
precision lowp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    fragColor = texture(u_texture, v_texcoord) * v_color;
}`,
}));

vi.mock('../../../packages/exojs-particles/src/renderers/glsl/particle.vert', () => ({ default: shaderSources.particleVert }));
vi.mock('../../../packages/exojs-particles/src/renderers/glsl/particle.frag', () => ({ default: shaderSources.particleFrag }));

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
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
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
  // The particle renderer is not part of the core renderer bindings — the
  // `@codexo/exojs-particles` package materialises it itself via its
  // Extension descriptor. Browser tests construct a bare backend (bypassing
  // Application), so the particle binding must be wired explicitly, same as
  // `wireCoreRenderers` does for Sprite/Mesh/Text.
  materializeRendererBindings(backend, particlesExtension.renderers);

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

  test('particle color channel tints a white texture', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
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
