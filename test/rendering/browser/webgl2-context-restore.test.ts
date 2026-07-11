/**
 * WebGL2 real context lose/restore browser test (B-09).
 *
 * Drives a genuine GL context-loss cycle through the `WEBGL_lose_context`
 * extension — `loseContext()` fires `webglcontextlost`, `restoreContext()`
 * fires `webglcontextrestored` — and asserts that rendering RESUMES with valid
 * resources afterwards by reading back pixels. This is the end-to-end proof for
 * the finding: synthetic signal-only tests passed while a real reset left the
 * backend drawing with dangling GL handles. After the fix, the backend evicts
 * and rebuilds all device-bound state on restore, so the same scene renders
 * identical pixels before and after the loss.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks (see webgl2-sprite-solid-color.test.ts — the registry compiles
// every core renderer's program on connect, so all core shaders need real GLSL).
// ---------------------------------------------------------------------------

const shaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv;
out vec4 v_color;
flat out uint v_textureSlot;
void main() {
  vec2 local;
  if (gl_VertexID == 0) local = vec2(a_localBounds.x, a_localBounds.y);
  else if (gl_VertexID == 1) local = vec2(a_localBounds.z, a_localBounds.y);
  else if (gl_VertexID == 2) local = vec2(a_localBounds.x, a_localBounds.w);
  else local = vec2(a_localBounds.z, a_localBounds.w);
  vec2 uv;
  if (gl_VertexID == 0) uv = vec2(a_uvBounds.x, a_uvBounds.y);
  else if (gl_VertexID == 1) uv = vec2(a_uvBounds.z, a_uvBounds.y);
  else if (gl_VertexID == 2) uv = vec2(a_uvBounds.x, a_uvBounds.w);
  else uv = vec2(a_uvBounds.z, a_uvBounds.w);
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  vec3 clip = u_projection * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv; v_color = a_color; v_textureSlot = a_textureSlot;
}`,

  meshVert: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  vec3 world = t * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,

  textVert: `#version 300 es
precision mediump float;
in vec2 a_position; in vec2 a_texcoord; in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * vec3(a_position + vec2(ni * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0); v_uv = a_texcoord;
}`,

  textFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv); }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;
  // The canvas must be attached for the browser to deliver webglcontextlost /
  // webglcontextrestored events reliably across engines.
  document.body.appendChild(canvas);

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

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const buf = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return [buf[0], buf[1], buf[2], buf[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 8): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
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

/**
 * Force a real GL context loss and wait for the backend's `onContextRestored`
 * to fire. `WEBGL_lose_context.loseContext()` dispatches `webglcontextlost`
 * (which the backend cancels with preventDefault); the backend then calls
 * `restoreContext()`, which dispatches `webglcontextrestored` on a later task —
 * so we await the backend signal rather than assuming synchronous delivery.
 */
const loseAndRestoreContext = async (backend: WebGl2Backend): Promise<void> => {
  const gl = backend.context;
  const canvas = gl.canvas as HTMLCanvasElement;
  const lose = gl.getExtension('WEBGL_lose_context');

  expect(lose, 'WEBGL_lose_context must be available to drive this test').not.toBeNull();

  const seen: string[] = [];

  canvas.addEventListener('webglcontextlost', () => seen.push('lost'), { once: true });
  canvas.addEventListener('webglcontextrestored', () => seen.push('restored'), { once: true });

  const restored = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`webglcontextrestored not delivered within 5s (raw events: ${seen.join(',') || 'none'}, isLost: ${gl.isContextLost()})`)),
      5000,
    );

    backend.onContextRestored.add(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

  lose!.loseContext();

  await restored;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 real context lose/restore (B-09)', () => {
  test('a sprite renders identically after a real lose/restore cycle', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      // Baseline: red inside the sprite, black (clear color) outside.
      render(backend, root);
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);

      // Genuine GPU reset: every GL handle created before this point is dead.
      await loseAndRestoreContext(backend);

      expect(backend.context.isContextLost()).toBe(false);

      // The same scene must render the same pixels — proving the backend
      // rebuilt its textures / buffers / VAOs / shader programs against the
      // fresh context instead of drawing with dangling handles.
      render(backend, root);
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);

      // No lingering GL error storm from stale handles.
      expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('survives two consecutive lose/restore cycles and a tint change', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(0, 255, 0);
      root.addChild(sprite);

      render(backend, root);
      expectPixelNear(readPixel(backend, 16, 16), [0, 255, 0, 255]);

      await loseAndRestoreContext(backend);
      await loseAndRestoreContext(backend);

      // A fresh texture created AFTER the losses must also upload + sample
      // correctly on the rebuilt context.
      const blueTexture = createSolidTexture('#0000ff', 16, 16);
      const blueSprite = new Sprite(blueTexture);

      blueSprite.setPosition(32, 32);
      root.addChild(blueSprite);
      sprite.tint = Color.white;

      render(backend, root);

      expectPixelNear(readPixel(backend, 16, 16), [255, 255, 255, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 255, 255]);
      expect(backend.context.getError()).toBe(backend.context.NO_ERROR);

      blueTexture.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
