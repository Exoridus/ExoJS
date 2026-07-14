/**
 * WebGPU renderer-matrix browser tests — Mesh retained instruction-set replay
 * (Track B Slice 3, mesh opt-in).
 *
 * The mesh counterpart of `webgpu-nine-slice-retained-instruction-replay.test.ts`.
 * Mesh's recordable draw is an INDEXED instanced draw over a SHARED, persistent
 * per-`Geometry` vertex+index buffer plus a group-owned per-instance node-index
 * stream; replay binds the mesh renderer's own group(0) `TransformUniforms` UBO
 * (parked on the bundle) + the group transform storage and issues
 * `drawIndexed`. The replay tier must reproduce the record frame's pixels
 * exactly. A live sprite OUTSIDE (and before) the group keeps the group's
 * shared storage rows starting at a non-zero frame-global index, so the
 * group-local node-index rebase (S3-D4) is load-bearing — the final cell
 * neuters it and proves the probes diverge.
 *
 * The group holds two same-geometry mesh runs with DISTINCT textures (2 red +
 * 2 green) → two recorded INSTANCED batches (each >= 2 instances, the
 * recordable WebGPU path), sharing ONE geometry buffer.
 *
 * CI guarantees a real WebGPU adapter; tests only skip when the software
 * adapter drops the device mid-test (same convention as the other WebGPU specs).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

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

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
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

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a frame through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
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

const hexToRgba = (hex: string): RgbaTuple => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

/**
 * Standard cell scene, mirroring the WebGL2 mesh retained cells: a live blue
 * sprite OUTSIDE (and before) the group at (48,0)-(64,16) keeps the group-local
 * rebase load-bearing; the group at (8,24) holds four meshes sharing ONE quad
 * geometry — two red (one instanced batch of 2) then two green (a second
 * instanced batch of 2). Group-local positions: redA (0,0), redB (16,0),
 * greenA (0,16), greenB (16,16).
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

describe('WebGPU renderer matrix: Mesh retained instruction replay cells', () => {
  test('cell 1 — mesh replay is pixel-identical to the record frame (fast/slow equivalence)', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      // F1: dirty collect + capture.
      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      // F2: clean entry replay + record — this IS the slow path's output.
      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      const probes: ReadonlyArray<readonly [number, number, string]> = [
        [56, 8, '#0000ff'], // live outside sprite
        [16, 32, '#ff0000'], // redA (batch 1)
        [32, 32, '#ff0000'], // redB (batch 1)
        [16, 48, '#00ff00'], // greenA (batch 2)
        [32, 48, '#00ff00'], // greenB (batch 2)
      ];
      let readPixel = readCanvas(backend);
      const slowPixels = probes.map(([x, y]) => readPixel(x, y));

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(slowPixels[i]!, hexToRgba(probes[i]![2]));
      }

      // F3: instruction replay — must be identical to the record frame.
      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(readPixel(probes[i]![0], probes[i]![1]), slowPixels[i]!, 0);
      }

      // Background stays clear on the replay tier (no stray out-of-range row).
      expectPixelNear(readPixel(58, 58), [0, 0, 0, 255]);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the cached path: replayed mesh pixels track the live view', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]);

      // Pan the camera 16px right: replayed content must appear 16px further
      // left — projection is resolved live at replay (S3-D1).
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]); // redB shifted to 8..24
      expectPixelNear(readPixel(16, 48), [0, 255, 0, 255]); // greenB shifted to 8..24
      expectPixelNear(readPixel(58, 32), [0, 0, 0, 255]); // background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the cached path relocates mesh pixels WITHOUT recapture', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      // The recorded batch instruction must survive the move untouched: a
      // group move only changes the live-composed group matrix (S3-D6).
      const recordedBatch = fragmentOf(scene.group).instructions!.instructions[0];

      scene.group.setPosition(24, 24);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedBatch);
      expect(fragmentOf(scene.group).instructions!.hasRecording).toBe(true);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]); // redA now (24,24)-(40,40)
      expectPixelNear(readPixel(32, 48), [0, 255, 0, 255]); // greenA now (24,40)-(40,56)
      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readPixel(56, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — transform-only mesh child move: in-place storage-row patch relocates one instance, no recapture', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      const recordedBatch = fragmentOf(scene.group).instructions!.instructions[0];

      // Slice 4c: a pure transform move on a direct child stays content-clean,
      // so the recording is patched in place (no recapture). redA and redB share
      // ONE batch but reference DISTINCT storage rows, so only redA moves.
      scene.redA.setPosition(0, 32); // group-local (0,32) -> world (8,56), off-canvas bottom

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedBatch); // patched, not re-recorded
      expect(fragmentOf(scene.group).instructions!.hasRecording).toBe(true);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // redA's old spot cleared
      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]); // redB (same batch) untouched
      expectPixelNear(readPixel(16, 48), [0, 255, 0, 255]); // greenA untouched
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — deliberate break: a neutered node-index rebase fetches the wrong storage rows and diverges', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();
    const original = WebGpuMeshRenderer.prototype._rebaseRetainedNodeIndices;

    try {
      // A live sprite before the group means the group's storage rows start at a
      // non-zero frame-global base; the group-owned storage only holds rows
      // [0, N). Skipping the rebase leaves the cached node indices frame-global,
      // so replay fetches the wrong / out-of-range rows -> the frame diverges.

      WebGpuMeshRenderer.prototype._rebaseRetainedNodeIndices = function (): void {};

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      } // F1 capture

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      } // F2 record

      const record = readCanvas(backend);
      const recordRed = record(16, 32);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      } // F3 broken replay

      const replay = readCanvas(backend);

      // redA's probe must no longer read the recorded red: the broken rebase
      // moved / dropped its instance.
      expect(replay(16, 32)).not.toEqual(recordRed);
    } finally {
      WebGpuMeshRenderer.prototype._rebaseRetainedNodeIndices = original;
      scene.destroy();
      backend.destroy();
    }
  });
});
