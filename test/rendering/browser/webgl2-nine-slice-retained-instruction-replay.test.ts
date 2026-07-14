/**
 * WebGL2 renderer-matrix browser tests — NineSlice retained instruction-set
 * replay (Track B Slice 3).
 *
 * The nine-slice counterpart of `webgl2-retained-instruction-replay.test.ts`:
 * a retained group whose playback was recorded replays through
 * `_replayRetainedBatch` from group-owned resources (persistent instance
 * buffer + group transform texture) and must produce BYTE-IDENTICAL frames to
 * the entry-replay slow path. A nine-slice node expands to MANY quad-instances
 * that all share one transform-buffer row, so the group-local node-index
 * rebase (S3-D4) and the per-batch byte offset are load-bearing in every
 * assertion: a live sprite OUTSIDE (and before) the group keeps the group's
 * shared rows starting at a non-zero frame-global index, so a broken rebase
 * (or a wrong byte offset) fetches the wrong / out-of-range transform row and
 * the full-canvas byte comparison fails.
 *
 * The nine-slice renderer uses inline GLSL (no `.vert`/`.frag` imports), so it
 * needs no shader mock; the Sprite/Mesh/Text mocks below only exist so
 * `wireCoreRenderers()` can eagerly compile every registered renderer.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks (Sprite/Mesh/Text — the nine-slice renderer uses inline GLSL).
// The sprite vertex mock keeps u_group so the OUTSIDE sprite stays correct
// under camera-pan / group-move cells; the transform texel 2 carries its tint.
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
// Infrastructure helpers (shared shape with the sprite retained-replay cells).
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

/** Full-framebuffer snapshot for byte-identical tier comparisons (S3-D10). */
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
 * Standard cell scene: one live sprite OUTSIDE (and before) the retained
 * group so the group's shared transform rows never start at row 0 — the
 * group-local node-index rebase (S3-D4) is load-bearing in every pixel
 * assertion, and the replay path interleaves with a live batch every frame.
 *
 * The group holds two nine-slice nodes with DISTINCT textures, so each records
 * its own single-texture batch (nine-slice binds one base texture per flush) —
 * exercising per-batch byte offsets across more than one recorded batch. Every
 * nine-slice node fills a 16x16 solid rect (slices/border 4 over a 16x16
 * source), 9 quad-instances sharing one transform row.
 *
 * Layout (canvas 64x64): blue outside sprite at (48,0)-(64,16); group at
 * (8,24) with a red nine-slice at group-local (0,0) -> world (8,24)-(24,40)
 * and a green nine-slice at group-local (16,16) -> world (24,40)-(40,56).
 */
const buildScene = () => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');
  const root = new Container();
  const outside = new Sprite(blue);
  const group = new RetainedContainer();
  const redNine = new NineSliceSprite(red, { slices: 4, border: 4, width: 16, height: 16 });
  const greenNine = new NineSliceSprite(green, { slices: 4, border: 4, width: 16, height: 16 });

  outside.setPosition(48, 0);
  root.addChild(outside);

  greenNine.setPosition(16, 16);
  group.addChild(redNine);
  group.addChild(greenNine);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    blue.destroy();
    red.destroy();
    green.destroy();
  };

  return { root, group, redNine, greenNine, destroy };
};

const expectBaseScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live outside sprite
  expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]); // red nine-slice inside the group
  expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]); // green nine-slice inside the group
  expectPixelNear(readPixel(backend, 4, 60), [0, 0, 0, 255]); // background
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 renderer matrix: NineSlice retained instruction-set replay cells', () => {
  test('cell 1 — the nine-slice instruction-replay tier is byte-identical to the entry-replay and collect tiers', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      // F1 — full collect + fragment capture (slow tier).
      render(backend, scene.root);

      const collectFrame = readCanvas(backend);

      expectBaseScenePixels(backend);
      expect(replaySpy).not.toHaveBeenCalled();

      // F2 — entry replay + instruction recording (the recording source).
      render(backend, scene.root);

      const recordFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(replaySpy).not.toHaveBeenCalled();

      // F3/F4 — instruction splice: recorded nine-slice batches replay from
      // group-owned resources. Same bytes, same rows (group-local rebase),
      // same live uniforms -> byte-identical.
      render(backend, scene.root);

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalled();

      render(backend, scene.root);

      const steadyFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1); // never re-recorded
      expectBaseScenePixels(backend);
      expect(recordFrame).toEqual(collectFrame);
      expect(replayFrame).toEqual(recordFrame);
      expect(steadyFrame).toEqual(recordFrame);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the replay path: live projection, no recapture', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Pan the camera 16px right: everything must appear 16px further left.
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // replay, not recapture
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 36, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readPixel(backend, 4, 28), [255, 0, 0, 255]); // red now at 0..8 visible
      expectPixelNear(readPixel(backend, 12, 44), [0, 255, 0, 255]); // green now 8..24
      expectPixelNear(readPixel(backend, 28, 28), [0, 0, 0, 255]); // old red spot is background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the replay path: one live group matrix relocates the cached nine-slice batches', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Move the WHOLE group: content revisions untouched (a group move is
      // decoupled by design), so the set keeps replaying — via live u_group.
      scene.group.setPosition(24, 8);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 28, 12), [255, 0, 0, 255]); // red 24..40 x 8..24
      expectPixelNear(readPixel(backend, 44, 28), [0, 255, 0, 255]); // green 40..56 x 24..40
      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — transform-only nine-slice child move: fast row-patch on a real GPU relocates all 9 quads, no re-record', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Slice 4b: a pure transform move on a direct child stays content-clean,
      // so the group keeps its recording and patches just this child's shared
      // transform row in place — all 9 quad-instances that reference it move
      // together. The pixel readback is the stale-render guard on a real GPU.
      scene.redNine.setPosition(32, 0); // world (40,24)-(56,40)
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // NO re-record: the recording is patched in place
      // Two distinct-texture nine-slice nodes record as TWO single-texture
      // batches (nine-slice binds one base texture per flush), so each replayed
      // frame splices both — proving per-batch byte offsets across >1 batch.
      expect(replaySpy).toHaveBeenCalledTimes(2); // one frame, two batches
      expectPixelNear(readPixel(backend, 48, 28), [255, 0, 0, 255]); // patched to the NEW spot
      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]); // old spot cleared

      // The fast tier keeps splicing the patched rows, byte-stable, no re-record.
      const patchedFrame = readCanvas(backend);

      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(4); // second frame, two more batch replays
      expect(readCanvas(backend)).toEqual(patchedFrame);
      expectPixelNear(readPixel(backend, 48, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]); // green sibling untouched
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });
});
