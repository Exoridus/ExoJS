/**
 * WebGL2 renderer-matrix browser tests — RepeatingSprite retained instruction-
 * set replay (Track B Slice 3 follow-up: extending the flush-level batch
 * cache to RepeatingSprite).
 *
 * Only the GEOMETRY path (TextureRegion source) is recordable — its 32-byte
 * instance layout matches the sprite/NineSlice batch shape exactly (node
 * index at word 7 of the 8-word instance), so it shares the sprite renderer's
 * group-owned bundle and replay seam. Cells:
 *
 * 1. tier byte-equality (collect / entry-replay-record / instruction-replay
 *    all produce identical frames),
 * 2. the load-bearing correctness gate this follow-up exists for: a scroll-
 *    offset mutation AFTER a batch was recorded must never replay STALE
 *    tiling — `RepeatingSprite.setOffset` marks geometry dirty and calls
 *    `invalidateCache()`, which bumps the node's content revision and
 *    propagates it through the `RetainedContainer` boundary, forcing a
 *    recapture before the next replay,
 * 3. a SHADER-path (bare Texture) RepeatingSprite inside a capture window
 *    poisons it (`_supportsRetainedBatches` only covers the geometry path) —
 *    the group must never reach the replay tier, staying pixel-correct on
 *    the live entry-replay tier across mutations instead.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks — same convention as webgl2-retained-instruction-replay.test.ts:
// the vitest shaderPlugin stubs every .vert/.frag import to "", but
// WebGl2Backend#initialize connects the renderer registry eagerly, so the
// Sprite/Mesh/Text shaders wireCoreRenderers() registers need valid GLSL even
// though this file never renders Mesh/Text. RepeatingSprite's own GLSL is
// authored inline in WebGl2RepeatingSpriteRenderer.ts (not an import), so it
// needs no mock here.
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
uniform mat3 u_group;
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
  vec3 clip = u_projection * u_group * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv; v_color = texelFetch(u_transforms, ivec2(2, int(a_nodeIndex)), 0); v_textureSlot = a_textureSlot;
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
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in float a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * u_group * vec3(a_position + vec2(ni * 0.0), 1.0);
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

/** Full-framebuffer snapshot for byte-identical tier comparisons. */
const readCanvas = (backend: WebGl2Backend): Uint8Array => {
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

/** A 16x8 source: left half red (x 0..8), right half green (x 8..16). */
const createStripedTexture = (): Texture => {
  const src = document.createElement('canvas');

  src.width = 16;
  src.height = 8;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(8, 0, 8, 8);

  return new Texture(src);
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

describe('WebGL2 renderer matrix: RepeatingSprite retained instruction-set replay', () => {
  test('cell 1 — geometry-path retained replay is byte-identical to the entry-replay and collect tiers', async () => {
    const backend = await createBackend();
    const blue = createSolidTexture('#0000ff');
    const striped = createStripedTexture();
    const region = new TextureRegion(striped, { x: 0, y: 0, width: 16, height: 8 });
    const root = new Container();
    const outside = new Sprite(blue);
    const group = new RetainedContainer();
    // destW == srcW (16) with modeX 'repeat' + fitX 'clip' => a SINGLE segment
    // spanning the full destination, sampling the region's full UV range.
    const repeating = new RepeatingSprite(region, { width: 16, height: 8, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    outside.setPosition(48, 0);
    root.addChild(outside);
    group.addChild(repeating);
    group.setPosition(8, 24);
    root.addChild(group);

    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      render(backend, root); // F1 — full collect + fragment capture

      const collectFrame = readCanvas(backend);

      expect(replaySpy).not.toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]); // red half
      expectPixelNear(readPixel(backend, 20, 28), [0, 255, 0, 255]); // green half

      render(backend, root); // F2 — entry replay + instruction recording

      const recordFrame = readCanvas(backend);

      expect(replaySpy).not.toHaveBeenCalled();

      render(backend, root); // F3 — instruction splice: recorded batch replays

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalled();
      expect(recordFrame).toEqual(collectFrame);
      expect(replayFrame).toEqual(recordFrame);
    } finally {
      root.destroy();
      blue.destroy();
      striped.destroy();
    }
  });

  test('cell 2 — a scroll-offset mutation after capture is never served STALE tiling by the replay tier', async () => {
    const backend = await createBackend();
    const blue = createSolidTexture('#0000ff');
    const striped = createStripedTexture();
    const region = new TextureRegion(striped, { x: 0, y: 0, width: 16, height: 8 });
    const root = new Container();
    const outside = new Sprite(blue);
    const group = new RetainedContainer();
    const repeating = new RepeatingSprite(region, { width: 16, height: 8, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    outside.setPosition(48, 0);
    root.addChild(outside);
    group.addChild(repeating);
    group.setPosition(8, 24);
    root.addChild(group);

    try {
      render(backend, root); // F1 capture
      render(backend, root); // F2 record
      render(backend, root); // F3 splice — now on the fast tier

      let replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, root); // steady replay before the mutation

      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]); // red half (dest 0..8)
      expectPixelNear(readPixel(backend, 20, 28), [0, 255, 0, 255]); // green half (dest 8..16)

      // Scroll by half the source width: 'repeat' wraps modulo srcLen, so the
      // sampled window shifts by exactly half a period and the two halves
      // SWAP. `setOffset` marks geometry dirty on this (geometry-path) sprite
      // and calls `invalidateCache()`, which bumps the node's content revision
      // and propagates it through the RetainedContainer boundary — the
      // fragment's `isClean()` check must fail on the next collect, forcing a
      // recapture instead of replaying the OLD (pre-swap) cached bytes.
      repeating.setOffset(8, 0);
      render(backend, root); // dirty collect (content revision changed)
      render(backend, root); // recapture with the new bytes
      render(backend, root); // splice of the fresh recording

      replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, root); // steady replay AFTER the mutation

      expect(replaySpy).toHaveBeenCalled(); // still on the fast tier — recaptured, not abandoned
      // If the replay served the STALE pre-offset bytes, these two assertions
      // would read the OLD (unswapped) colors instead.
      expectPixelNear(readPixel(backend, 12, 28), [0, 255, 0, 255]); // now green (was red)
      expectPixelNear(readPixel(backend, 20, 28), [255, 0, 0, 255]); // now red (was green)
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live sibling unaffected
    } finally {
      root.destroy();
      blue.destroy();
      striped.destroy();
    }
  });

  test('cell 3 — a shader-path RepeatingSprite inside a capture window poisons it: never reaches the replay tier, stays pixel-correct on live entry-replay across mutations', async () => {
    const backend = await createBackend();
    const blue = createSolidTexture('#0000ff');
    const striped = createStripedTexture(); // bare Texture source -> shader path
    const root = new Container();
    const outside = new Sprite(blue);
    const group = new RetainedContainer();
    const repeating = new RepeatingSprite(striped, { width: 16, height: 8, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    outside.setPosition(48, 0);
    root.addChild(outside);
    group.addChild(repeating);
    group.setPosition(8, 24);
    root.addChild(group);

    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      // Render many frames, including a scroll mutation — the shader path
      // never records/replays a batch (S3-D5.1: _supportsRetainedBatches only
      // covers the geometry path here), so the group must stay correct via
      // the (poisoned, permanently-entry-replay) live path the whole time.
      for (let i = 0; i < 4; i++) {
        render(backend, root);
      }

      expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 20, 28), [0, 255, 0, 255]);

      repeating.setOffset(8, 0);

      for (let i = 0; i < 4; i++) {
        render(backend, root);
      }

      expectPixelNear(readPixel(backend, 12, 28), [0, 255, 0, 255]);
      expectPixelNear(readPixel(backend, 20, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]);

      expect(replaySpy).not.toHaveBeenCalled();
    } finally {
      root.destroy();
      blue.destroy();
      striped.destroy();
    }
  });
});
