/**
 * WebGL2 renderer-matrix browser tests — Mesh retained instruction-set replay.
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
 * node-index rebase is load-bearing in every assertion — the final cell
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

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Shader mocks. The mesh instanced mock is FAITHFUL to the real instanced mesh
// shader: it applies u_projection * u_group * (transform-row * position) and
// modulates by the vertex color and the transform-row tint (texel 2), so the
// camera-pan / group-move cells exercise the live u_group / u_projection reads.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Infrastructure helpers (shared shape with the sprite/nine-slice cells).
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

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

/** Full-framebuffer snapshot for byte-identical tier comparisons. */
const readCanvas = (backend: WebGl2Backend): Uint8Array => {
  const buf = new Uint8Array(canvasSize * canvasSize * 4);
  const gl = backend.context;

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return buf;
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
 * node-index rebase is load-bearing in every pixel assertion.
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

/**
 * Same shape as {@link buildScene}, but the group's meshes are built from raw
 * vertex ARRAYS instead of a shared {@link Geometry}. Those can only ever take
 * the mesh renderer's dynamic single-draw path, which is not recordable — the
 * collect-time admission predicate must keep the group off the recorded tier
 * entirely rather than letting it record and poison every frame.
 */
const buildArrayMeshScene = () => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const root = new Container();
  const outside = new Sprite(blue);
  const group = new RetainedContainer();
  const vertices = new Float32Array([0, 0, 16, 0, 16, 16, 0, 16]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const meshA = new Mesh({ vertices, indices, uvs, texture: red });
  const meshB = new Mesh({ vertices, indices, uvs, texture: red });

  outside.setPosition(48, 0);
  root.addChild(outside);

  meshB.setPosition(16, 0);
  group.addChild(meshA);
  group.addChild(meshB);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    blue.destroy();
    red.destroy();
  };

  return { root, group, meshA, meshB, destroy };
};

const expectArrayScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readWebGl2Pixel(backend, 52, 8), [0, 0, 255, 255]); // live outside sprite
  expectPixelNear(readWebGl2Pixel(backend, 16, 32), [255, 0, 0, 255]); // meshA (8,24)-(24,40)
  expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]); // meshB (24,24)-(40,40)
  expectPixelNear(readWebGl2Pixel(backend, 58, 58), [0, 0, 0, 255]); // background
};

const expectBaseScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readWebGl2Pixel(backend, 52, 8), [0, 0, 255, 255]); // live outside sprite
  expectPixelNear(readWebGl2Pixel(backend, 16, 32), [255, 0, 0, 255]); // redA (8,24)-(24,40)
  expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]); // redB (24,24)-(40,40)
  expectPixelNear(readWebGl2Pixel(backend, 16, 48), [0, 255, 0, 255]); // greenA (8,40)-(24,56)
  expectPixelNear(readWebGl2Pixel(backend, 32, 48), [0, 255, 0, 255]); // greenB (24,40)-(40,56)
  expectPixelNear(readWebGl2Pixel(backend, 58, 58), [0, 0, 0, 255]); // background
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
      expectPixelNear(readWebGl2Pixel(backend, 36, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readWebGl2Pixel(backend, 16, 32), [255, 0, 0, 255]); // redB shifted to 8..24
      expectPixelNear(readWebGl2Pixel(backend, 16, 48), [0, 255, 0, 255]); // greenB shifted to 8..24
      expectPixelNear(readWebGl2Pixel(backend, 58, 32), [0, 0, 0, 255]); // background
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
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]); // redA now (24,24)-(40,40)
      expectPixelNear(readWebGl2Pixel(backend, 32, 48), [0, 255, 0, 255]); // greenA now (24,40)-(40,56)
      expectPixelNear(readWebGl2Pixel(backend, 16, 32), [0, 0, 0, 255]); // old red spot cleared
      expectPixelNear(readWebGl2Pixel(backend, 52, 8), [0, 0, 255, 255]); // live sprite unaffected
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

      // A pure transform move on a direct child stays content-clean, so the
      // group keeps its recording and patches just this child's shared
      // transform row in place. redA and redB share ONE batch but reference
      // DISTINCT rows, so only redA moves — the per-instance row rebase and the
      // in-place patch are both load-bearing here.
      scene.redA.setPosition(0, 32); // group-local (0,32) -> world (8,56)-(24,72), off-canvas bottom
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // NO re-record: the recording is patched in place
      expect(replaySpy).toHaveBeenCalledTimes(2); // one frame, two batches
      expectPixelNear(readWebGl2Pixel(backend, 16, 32), [0, 0, 0, 255]); // redA's old spot cleared
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]); // redB (same batch) untouched
      expectPixelNear(readWebGl2Pixel(backend, 16, 48), [0, 255, 0, 255]); // greenA untouched

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

  test('cell 6 — array-vertex meshes are never recorded: no capture, no poison, pixel-stable entry replay across mutation', async () => {
    const backend = await createBackend();
    const scene = buildArrayMeshScene();
    const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
    const poisonSpy = vi.spyOn(backend, '_poisonRetainedCaptures');

    try {
      // An array-vertex mesh re-packs its vertices into the renderer's own
      // scratch buffers every frame, so it can only ever take the dynamic
      // single draw — the path that poisons an open capture. The collect-time
      // admission predicate keeps the capture from opening in the first place,
      // which must not change a single pixel of what the group renders.
      render(backend, scene.root); // F1 collect

      const collectFrame = readCanvas(backend);

      expectArrayScenePixels(backend);

      render(backend, scene.root); // F2 — would have recorded, now does not
      render(backend, scene.root); // F3 — would have poisoned + re-armed

      expect(beginSpy).not.toHaveBeenCalled();
      expect(poisonSpy).not.toHaveBeenCalled();
      expect(readCanvas(backend)).toEqual(collectFrame);

      // A cached replay that had gone stale would freeze the moved mesh at its
      // old spot; the entry-replay tier must track it live.
      scene.meshB.setPosition(0, 16);
      render(backend, scene.root);

      expect(poisonSpy).not.toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 16, 48), [255, 0, 0, 255]); // meshB now at group-local (0,16)
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [0, 0, 0, 255]); // its old spot cleared
      expectPixelNear(readWebGl2Pixel(backend, 16, 32), [255, 0, 0, 255]); // meshA unmoved
      expectPixelNear(readWebGl2Pixel(backend, 52, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });
});
