/**
 * WebGL2 renderer-matrix browser tests — Text retained instruction-set replay
 * (Track B extension, Task 2).
 *
 * The WebGL2 counterpart of `webgpu-text-retained-instruction-replay.test.ts`.
 * Text is the retained renderer that opts OUT of the shared `TransformBuffer`
 * (`_consumesSharedTransform === false`) AND, on WebGL2 only, keeps its world
 * transform CPU-baked into the recorded vertex bytes — the shipped `text.vert`
 * reads no per-node transform, because a vertex-stage texelFetch of the RGBA32F
 * data texture collapses the draw on ANGLE/D3D11 whenever a glyph atlas is
 * co-bound (see `webgl2-text-vertex-shader-regression.test.ts`). So the group
 * replay path is: recorded baked vertex bytes drawn with `drawElements`, the
 * per-node STYLE resolved live from a group-owned RGBA32F texture, and an
 * own-transform move re-baked on the CPU (there is no shared-row rebase to get
 * wrong here — the node index addresses the group-owned style texture — but
 * there IS a real risk of stale baked positions or a wrong style texture if the
 * record/replay/patch logic is broken).
 *
 * These render through a REAL GL context and the REAL shipped text shaders
 * (imported via `?raw`, bypassing the browser-test shader stub).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2TextRenderer } from '#rendering/webgl2/WebGl2TextRenderer';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader wiring — REAL shipped text GLSL via `?raw` (the stub plugin only
// rewrites bare `.vert`/`.frag` ids), plus minimal valid Sprite/Mesh mocks so
// `wireCoreRenderers()` can eagerly compile the whole registry.
// ---------------------------------------------------------------------------

vi.mock('#rendering/webgl2/glsl/text.vert', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-sdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-msdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-color.frag?raw')).default }));

const auxShaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision highp float;
in vec4 a_localBounds; in vec4 a_uvBounds; in vec4 a_color; in uint a_textureSlot; in uint a_nodeIndex;
uniform mat3 u_projection; uniform mat3 u_group; uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; flat out uint v_textureSlot;
void main() {
  vec2 local = vec2(a_localBounds.x, a_localBounds.y);
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  gl_Position = vec4((u_projection * u_group * vec3(world, 1.0)).xy, 0.0, 1.0);
  v_uv = a_uvBounds.xy; v_color = a_color; v_textureSlot = a_textureSlot;
}`,
  meshVert: `#version 300 es
precision highp float;
in vec2 a_position; in vec2 a_texcoord; in vec4 a_color; in uint a_nodeIndex;
uniform mat3 u_projection; uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  gl_Position = vec4((u_projection * t * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color; v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,
  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: auxShaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: auxShaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: auxShaderSources.meshFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers (shared shape with the sibling browser specs).
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 96;

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

  return [buf[0]!, buf[1]!, buf[2]!, buf[3]!];
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
    expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(tolerance);
  }
};

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

/**
 * One large white text node inside a positioned retained group over black.
 * A region sampled a few px into a wide uppercase glyph is reliably ink, not
 * anti-aliased edge.
 */
const buildScene = (): { root: Container; group: RetainedContainer; text: Text } => {
  const root = new Container();
  const group = new RetainedContainer();
  const text = new Text('MW', { fillColor: Color.white, fontSize: 40 });

  text.setPosition(4, 4);
  group.addChild(text);
  group.setPosition(8, 8);
  root.addChild(group);

  return { root, group, text };
};

/** Sum of all channels over the whole canvas — a total-ink measure. */
const totalInk = (frame: Uint8Array): number => {
  let sum = 0;

  for (let i = 0; i < frame.length; i += 4) {
    sum += frame[i]! + frame[i + 1]! + frame[i + 2]!;
  }

  return sum;
};

describe('WebGL2 renderer matrix: Text retained instruction-set replay cells', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('cell 1 — Text opts in and the instruction-replay tier is byte-identical to the record frame', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      expect(new WebGl2TextRenderer()._supportsRetainedBatches).toBe(true);

      render(backend, scene.root); // F1: collect + capture
      expect(replaySpy).not.toHaveBeenCalled();

      render(backend, scene.root); // F2: entry replay + record

      const recordFrame = readCanvas(backend);

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);
      // Ink must be present, else the byte comparison below is vacuous.
      expect(totalInk(recordFrame)).toBeGreaterThan(0);

      render(backend, scene.root); // F3: instruction splice (fast path)

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalled();
      expect(replayFrame).toEqual(recordFrame);

      render(backend, scene.root); // F4: steady state

      expect(readCanvas(backend)).toEqual(recordFrame);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the cached path: replayed glyph pixels track the live projection, no recapture', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      for (let f = 0; f < 3; f++) render(backend, scene.root);

      const before = readPixel(backend, 20, 24);

      expect(before).not.toEqual([0, 0, 0, 255]);

      const recordedInstruction = fragmentOf(scene.group).instructions!.instructions[0];
      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');

      // Pan the camera 16px right: scene content moves 16px left on screen.
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedInstruction);

      // Panning the camera +16px right shifts the same glyph feature 16px left:
      // what was at x=20 is now at x=4.
      const panned = readPixel(backend, 4, 24);

      expect(panned).not.toEqual([0, 0, 0, 255]);
      expectPixelNear(panned, before, 40);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the cached path relocates glyph pixels WITHOUT recapture', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      for (let f = 0; f < 3; f++) render(backend, scene.root);

      const before = readPixel(backend, 20, 24);

      expect(before).not.toEqual([0, 0, 0, 255]);

      const recordedInstruction = fragmentOf(scene.group).instructions!.instructions[0];
      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');

      scene.group.setPosition(28, 8); // was (8,8): +20px right

      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedInstruction);

      const moved = readPixel(backend, 40, 24);

      expect(moved).not.toEqual([0, 0, 0, 255]);
      expectPixelNear(moved, before, 40);
      expectPixelNear(readPixel(backend, 20, 24), [0, 0, 0, 255], 8); // old spot cleared
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — own-transform move re-bakes the moved node in place on the CPU, no re-record', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      for (let f = 0; f < 3; f++) render(backend, scene.root);

      const before = readPixel(backend, 20, 24);

      expect(before).not.toEqual([0, 0, 0, 255]);

      const recordedInstruction = fragmentOf(scene.group).instructions!.instructions[0];
      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      scene.text.setPosition(24, 4); // was (4,4): +20px right within the group

      render(backend, scene.root);

      // The CPU patch rewrote the moved node's baked vertex range in place — no
      // full re-record (a re-record would run `_beginRetainedCapture` again),
      // and the SAME recorded instruction still replays on the fast tier.
      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedInstruction);

      const moved = readPixel(backend, 40, 24);

      expect(moved).not.toEqual([0, 0, 0, 255]);
      expectPixelNear(moved, before, 40);
      expectPixelNear(readPixel(backend, 20, 24), [0, 0, 0, 255], 8); // old spot cleared

      // The patched recording keeps splicing byte-stable, no re-record.
      const patchedFrame = readCanvas(backend);

      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(readCanvas(backend)).toEqual(patchedFrame);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — a content change forces a full re-record and replays the new content', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      for (let f = 0; f < 3; f++) render(backend, scene.root);

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      scene.text.text = 'X';

      render(backend, scene.root); // content-dirty frame

      for (let f = 0; f < 3; f++) render(backend, scene.root);

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);
      expect(totalInk(readCanvas(backend))).toBeGreaterThan(0);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — deliberate break: a neutered _replayRetainedBatch drops the retained draw and diverges', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const original = WebGl2TextRenderer.prototype._replayRetainedBatch;

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record

      const recordInk = totalInk(readCanvas(backend));

      expect(recordInk).toBeGreaterThan(0);

      // F3 static frame: the fast/instruction-replay tier is the only path that
      // can draw the group's glyphs. A neutered replay that never issues its
      // drawElements leaves the canvas empty where the record frame had ink.
      WebGl2TextRenderer.prototype._replayRetainedBatch = function (): void {};

      render(backend, scene.root);

      expect(totalInk(readCanvas(backend))).toBe(0);
      expect(totalInk(readCanvas(backend))).not.toBe(recordInk);
    } finally {
      WebGl2TextRenderer.prototype._replayRetainedBatch = original;
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 7 — deliberate break: a neutered CPU patch leaves the moved node frozen at its stale position', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const original = WebGl2TextRenderer.prototype._patchOwnTransformRow;

    try {
      for (let f = 0; f < 3; f++) render(backend, scene.root);

      const preMove = readCanvas(backend);

      expect(totalInk(preMove)).toBeGreaterThan(0);

      // Neuter the patch so it claims success but writes NOTHING: the recording
      // stays valid (return true), so replay keeps splicing the stale baked
      // bytes — the glyph is frozen at its old position instead of moving.
      WebGl2TextRenderer.prototype._patchOwnTransformRow = function (): boolean {
        return true;
      };

      scene.text.setPosition(24, 4); // a real move that SHOULD change the frame
      render(backend, scene.root);

      // Frozen: byte-identical to the pre-move frame despite the move.
      expect(readCanvas(backend)).toEqual(preMove);

      // Contrast: restore the patch, apply a fresh move — the glyph now relocates
      // and the frame diverges from the frozen (stale) one.
      WebGl2TextRenderer.prototype._patchOwnTransformRow = original;
      scene.text.setPosition(44, 4);
      render(backend, scene.root);

      expect(readCanvas(backend)).not.toEqual(preMove);
    } finally {
      WebGl2TextRenderer.prototype._patchOwnTransformRow = original;
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 8 — deliberate break: a neutered _configureRetainedVao leaves the batch unrenderable and diverges', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const original = WebGl2TextRenderer.prototype._configureRetainedVao;

    try {
      // F1 capture, then neuter the finalize hook BEFORE the record frame's
      // capture-end wires the batch VAO + group-owned style texture. With
      // neither configured, the replay guard bails and nothing draws.
      render(backend, scene.root);

      WebGl2TextRenderer.prototype._configureRetainedVao = function (): void {};

      render(backend, scene.root); // F2 record (finalize neutered)
      render(backend, scene.root); // F3 replay attempt

      expect(totalInk(readCanvas(backend))).toBe(0);

      // Restore + re-record: the group recovers to visible ink.
      WebGl2TextRenderer.prototype._configureRetainedVao = original;
      scene.text.text = 'MW '; // content change forces a fresh capture/record
      for (let f = 0; f < 3; f++) render(backend, scene.root);

      expect(totalInk(readCanvas(backend))).toBeGreaterThan(0);
    } finally {
      WebGl2TextRenderer.prototype._configureRetainedVao = original;
      scene.root.destroy();
      backend.destroy();
    }
  });
});
