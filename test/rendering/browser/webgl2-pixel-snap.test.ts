/**
 * WebGL2 render-only pixel-snapping browser tests.
 *
 * The exact snapping math (device-pixel mapping, rounding, shared-boundary
 * snapping, downgrade) is proven by `test/rendering/pixel-snap.test.ts`. These
 * end-to-end tests verify that snapping flows through the real WebGL2 pipeline
 * without breaking rendering, keeps logical state untouched, produces seam-free
 * geometry, stays deterministic, and downgrades gracefully under rotation.
 *
 * Note on single-frame pixel assertions: a solid quad's rasterised coverage is
 * already quantised to the device grid (pixel-centre rule), so a static
 * solid-colour frame cannot distinguish snapped from unsnapped — the snapping
 * benefit is sampling stability under motion. We therefore assert render
 * correctness, the render-only contract, and seam-freeness rather than a
 * snapped-vs-unsnapped solid-pixel diff.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

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
  spriteFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
flat in uint v_textureSlot;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;
uniform sampler2D u_texture3;
uniform sampler2D u_texture4;
uniform sampler2D u_texture5;
uniform sampler2D u_texture6;
uniform sampler2D u_texture7;
out vec4 outColor;
vec4 sampleTexture(uint slot, vec2 uv) {
  if (slot == uint(0)) return texture(u_texture0, uv);
  if (slot == uint(1)) return texture(u_texture1, uv);
  if (slot == uint(2)) return texture(u_texture2, uv);
  if (slot == uint(3)) return texture(u_texture3, uv);
  if (slot == uint(4)) return texture(u_texture4, uv);
  if (slot == uint(5)) return texture(u_texture5, uv);
  if (slot == uint(6)) return texture(u_texture6, uv);
  return texture(u_texture7, uv);
}
void main() { outColor = sampleTexture(v_textureSlot, v_uv) * v_color; }`,
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
vi.mock('#rendering/webgl2/glsl/sprite.frag', () => ({ default: shaderSources.spriteFrag }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFrag }));

type RgbaTuple = readonly [number, number, number, number];

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

const readAll = (backend: WebGl2Backend): Uint8Array => {
  const buf = new Uint8Array(canvasSize * canvasSize * 4);
  const gl = backend.context;

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return buf;
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

// ---------------------------------------------------------------------------
// Sprite — position snapping is render-only
// ---------------------------------------------------------------------------

describe('WebGL2 pixel snapping — Sprite position mode', () => {
  test('renders correctly at a fractional position and leaves logical state untouched', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(12.37, 14.83);
      sprite.pixelSnapMode = 'position';
      root.addChild(sprite);

      const worldBefore = sprite.getGlobalTransform().clone();

      render(backend, root);

      // Renders through the snap pipeline (interior covered, exterior clear).
      expectPixelNear(readPixel(backend, 20, 22), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 2, 2), [0, 0, 0, 255]);

      // Render-only: logical position and world transform are unchanged.
      expect(sprite.x).toBe(12.37);
      expect(sprite.y).toBe(14.83);
      expect(sprite.getGlobalTransform().equals(worldBefore)).toBe(true);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('unsnapped baseline renders the same interior color', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(12.37, 14.83);
      sprite.pixelSnapMode = 'none';
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readPixel(backend, 20, 22), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('snapped rendering is deterministic across frames', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(9.6, 5.2);
      sprite.pixelSnapMode = 'geometry';
      root.addChild(sprite);

      render(backend, root);
      const first = readAll(backend);

      render(backend, root);
      const second = readAll(backend);

      expect(Array.from(second)).toEqual(Array.from(first));
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// NineSlice — geometry snapping is seam-free and downgrades under rotation
// ---------------------------------------------------------------------------

describe('WebGL2 pixel snapping — NineSlice geometry mode', () => {
  test('produces no interior seams at a fractional placement', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 32, 32);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 41, height: 41 });

    try {
      panel.setPosition(6.3, 6.3);
      panel.pixelSnapMode = 'geometry';
      root.addChild(panel);

      render(backend, root);

      // Scan a horizontal line well inside the panel: every pixel must be the
      // solid panel colour — a snapping-induced seam would show as black.
      for (let x = 10; x <= 44; x++) {
        const pixel = readPixel(backend, x, 26);

        expect(pixel[0]).toBeGreaterThan(200); // red present → no gap
      }
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('geometry mode under rotation downgrades without error and keeps logical transform', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff', 32, 32);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 30, height: 30 });

    try {
      panel.setPosition(32, 32);
      panel.setRotation(25);
      panel.pixelSnapMode = 'geometry';
      root.addChild(panel);

      const worldBefore = panel.getGlobalTransform().clone();

      expect(() => render(backend, root)).not.toThrow();

      // Logical transform untouched by the (downgraded) snap.
      expect(panel.getGlobalTransform().equals(worldBefore)).toBe(true);
      // Still drew something blue near the centre.
      expect(readPixel(backend, 32, 32)[2]).toBeGreaterThan(128);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
