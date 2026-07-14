/**
 * WebGL2 renderer-matrix browser tests — Mesh retained instruction-set replay
 * (Track B Slice 3, mesh opt-in).
 *
 * The mesh counterpart of `webgl2-nine-slice-retained-instruction-replay.test.ts`.
 * Mesh's recordable draw is structurally different from the self-contained
 * instance-stream renderers (sprite / nine-slice / repeating): it is an INDEXED
 * instanced draw over a SHARED, persistent per-`Geometry` vertex+index buffer
 * (the mesh renderer's `_staticGeometryCache`, referenced not copied) plus a
 * thin group-owned per-instance node-index stream. Replay therefore drives
 * `drawElementsInstanced` over the group's own node-index buffer + the shared
 * geometry, and must produce BYTE-IDENTICAL frames to the entry-replay slow
 * path.
 *
 * A live sprite OUTSIDE (and before) the group keeps the group's shared
 * transform rows starting at a non-zero frame-global index, so the group-local
 * node-index rebase (S3-D4) is load-bearing in every assertion — the final cell
 * neuters the rebase hook and proves the frame then diverges.
 *
 * The group holds two same-geometry mesh runs with DISTINCT textures (2 red +
 * 2 green), so each run records its own single-texture INSTANCED batch (>= 2
 * instances, the recordable path on both backends) — exercising per-batch byte
 * offsets across more than one recorded batch, all sharing ONE geometry buffer.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2MeshRenderer } from '#rendering/webgl2/WebGl2MeshRenderer';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks. The mesh instanced mock is FAITHFUL to the real instanced mesh
// shader: it applies u_projection * u_group * (transform-row * position) and
// modulates by the vertex color and the transform-row tint (texel 2), so the
// camera-pan / group-move cells exercise the live u_group / u_projection reads.
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
uniform mat3 u_group;
uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * a_position.x + m0.y * a_position.y + m1.x, m0.z * a_position.x + m0.w * a_position.y + m1.y);
  vec3 clip = u_projection * u_group * vec3(world, 1.0);
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
// Infrastructure helpers (shared shape with the sprite/nine-slice cells).
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

/** A 16x16 textured quad geometry (usage 'static' by default). */
const createQuadGeometry = (): Geometry => {
  const stride = 16; // vec2 position (8) + vec2 texcoord (8)
  const buffer = new ArrayBuffer(4 * stride);
  const view = new DataView(buffer);
  const verts = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: 16, y: 0, u: 1, v: 0 },
    { x: 16, y: 16, u: 1, v: 1 },
    { x: 0, y: 16, u: 0, v: 1 },
  ];

  verts.forEach((vert, i) => {
    const base = i * stride;

    view.setFloat32(base + 0, vert.x, true);
    view.setFloat32(base + 4, vert.y, true);
    view.setFloat32(base + 8, vert.u, true);
    view.setFloat32(base + 12, vert.v, true);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    vertexData: buffer,
    stride,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });
};

/**
 * Standard cell scene: one live sprite OUTSIDE (and before) the retained group
 * so the group's shared transform rows never start at row 0 — the group-local
 * node-index rebase (S3-D4) is load-bearing in every pixel assertion.
 *
 * The group holds 4 meshes sharing ONE quad geometry: two red (one instanced
 * batch of 2) then two green (a second instanced batch of 2). Two batches
 * exercise per-batch byte offsets into the group node-index buffer; the shared
 * geometry buffer is referenced by both (never copied into the bundle).
 *
 * Layout (canvas 64x64): blue outside sprite at (48,0)-(64,16); group at (8,24)
 * with red quads at group-local (0,0)/(16,0) and green quads at (0,16)/(16,16).
 */
const buildScene = () => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');
  const geometry = createQuadGeometry();
  const root = new Container();
  const outside = new Sprite(blue);
  const group = new RetainedContainer();
  const redA = new Mesh({ geometry, texture: red });
  const redB = new Mesh({ geometry, texture: red });
  const greenA = new Mesh({ geometry, texture: green });
  const greenB = new Mesh({ geometry, texture: green });

  outside.setPosition(48, 0);
  root.addChild(outside);

  redB.setPosition(16, 0);
  greenA.setPosition(0, 16);
  greenB.setPosition(16, 16);
  group.addChild(redA);
  group.addChild(redB);
  group.addChild(greenA);
  group.addChild(greenB);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    geometry.destroy();
    blue.destroy();
    red.destroy();
    green.destroy();
  };

  return { root, group, redA, redB, greenA, greenB, destroy };
};

const expectBaseScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live outside sprite
  expectPixelNear(readPixel(backend, 16, 32), [255, 0, 0, 255]); // redA (8,24)-(24,40)
  expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]); // redB (24,24)-(40,40)
  expectPixelNear(readPixel(backend, 16, 48), [0, 255, 0, 255]); // greenA (8,40)-(24,56)
  expectPixelNear(readPixel(backend, 32, 48), [0, 255, 0, 255]); // greenB (24,40)-(40,56)
  expectPixelNear(readPixel(backend, 58, 58), [0, 0, 0, 255]); // background
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 renderer matrix: Mesh retained instruction-set replay cells', () => {
  test('cell 1 — the mesh instruction-replay tier is byte-identical to the entry-replay and collect tiers', async () => {
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

      // F3/F4 — instruction splice: recorded mesh batches replay indexed from
      // group-owned resources (node-index stream) + the shared geometry. Same
      // bytes, same rows (group-local rebase), same live uniforms -> identical.
      render(backend, scene.root);

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalledTimes(2); // two batches (red run, green run)

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
      expect(replaySpy).toHaveBeenCalledTimes(2);
      expectPixelNear(readPixel(backend, 36, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readPixel(backend, 16, 32), [255, 0, 0, 255]); // redB shifted to 8..24
      expectPixelNear(readPixel(backend, 16, 48), [0, 255, 0, 255]); // greenB shifted to 8..24
      expectPixelNear(readPixel(backend, 58, 32), [0, 0, 0, 255]); // background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the replay path: one live group matrix relocates the cached mesh batches', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Move the WHOLE group +16px right: content revisions untouched (a group
      // move is decoupled by design), so the set keeps replaying via live u_group.
      scene.group.setPosition(24, 24);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(2);
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]); // redA now (24,24)-(40,40)
      expectPixelNear(readPixel(backend, 32, 48), [0, 255, 0, 255]); // greenA now (24,40)-(40,56)
      expectPixelNear(readPixel(backend, 16, 32), [0, 0, 0, 255]); // old red spot cleared
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — transform-only mesh child move: fast row-patch on a real GPU relocates one instance, no re-record', async () => {
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
      // transform row in place. redA and redB share ONE batch but reference
      // DISTINCT rows, so only redA moves — the per-instance row rebase and the
      // in-place patch are both load-bearing here.
      scene.redA.setPosition(0, 32); // group-local (0,32) -> world (8,56)-(24,72), off-canvas bottom
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // NO re-record: the recording is patched in place
      expect(replaySpy).toHaveBeenCalledTimes(2); // one frame, two batches
      expectPixelNear(readPixel(backend, 16, 32), [0, 0, 0, 255]); // redA's old spot cleared
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]); // redB (same batch) untouched
      expectPixelNear(readPixel(backend, 16, 48), [0, 255, 0, 255]); // greenA untouched

      const patchedFrame = readCanvas(backend);

      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(4); // second frame, two more batch replays
      expect(readCanvas(backend)).toEqual(patchedFrame);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — deliberate break: a neutered node-index rebase fetches the wrong rows and diverges', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const original = WebGl2MeshRenderer.prototype._rebaseRetainedNodeIndices;

    try {
      // Baseline: correct replay is byte-identical to the record frame.
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record

      const recordFrame = readCanvas(backend);

      render(backend, scene.root); // F3 splice (correct rebase)

      expect(readCanvas(backend)).toEqual(recordFrame);
    } finally {
      scene.destroy();
      backend.destroy();
    }

    // A live sprite before the group means the group's rows start at a non-zero
    // frame-global base; the group-owned transform texture only holds rows
    // [0, N). Skipping the group-local rebase leaves the cached node indices
    // frame-global, so replay fetches out-of-range / wrong rows -> the frame
    // must diverge from the correct record frame.
    const brokenBackend = await createBackend();
    const brokenScene = buildScene();

    try {
      WebGl2MeshRenderer.prototype._rebaseRetainedNodeIndices = function (): void {};

      render(brokenBackend, brokenScene.root); // F1 capture
      render(brokenBackend, brokenScene.root); // F2 record

      const recordFrame = readCanvas(brokenBackend);

      render(brokenBackend, brokenScene.root); // F3 splice (broken rebase)

      expect(readCanvas(brokenBackend)).not.toEqual(recordFrame);
    } finally {
      WebGl2MeshRenderer.prototype._rebaseRetainedNodeIndices = original;
      brokenScene.destroy();
      brokenBackend.destroy();
    }
  });
});
