/**
 * WebGPU Text retained-batch record/replay (Track B extension, Task 1).
 *
 * Text is the first retained renderer that opts OUT of the shared
 * `TransformBuffer` (`_consumesSharedTransform === false`) — its per-vertex
 * "node index" addresses its OWN private per-node style+transform buffer, so
 * the generic bundle/scan/rebase machinery has nothing to persist for it.
 * These tests pin the renderer-owned mechanism that replaces it end to end:
 *
 * - `_supportsRetainedBatches` opt-in: record on the second clean frame,
 *   replay without re-collecting glyph quads on the third,
 * - camera pan and group move replay for free (no recorded-byte touch),
 * - an own-transform move patches the node's row in `TextRetainedReplayState`
 *   in place (O(1)) instead of a full re-record,
 * - a content change forces a full re-record,
 * - a flush spanning two distinct atlas textures poisons the capture rather
 *   than corrupting or silently dropping data (falls back to entry replay),
 * - the `WebGpuBackend._finalizeRetainedCapture` guard: a Text-only capture
 *   never issues a bogus shared-transform-row copy (the bug this task's
 *   investigation found and fixed upstream of the renderer work),
 * - deliberate-break mutation proofs on `_replayRetainedBatch` and
 *   `_patchOwnTransformRow` (both interface-required, public hooks).
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Text } from '#rendering/text/Text';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuRetainedGroupBundle } from '#rendering/webgpu/WebGpuRetainedGroupResources';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';

interface LabeledBuffer {
  readonly label: string;
  destroy(): void;
}

interface CapturedWrite {
  readonly label: string;
  readonly bufferOffset: number;
  readonly bytes: Uint8Array;
}

interface CapturedDraw {
  readonly indexCount: number;
  readonly instanceCount: number;
}

interface MockWebGpuEnvironment {
  readonly canvas: HTMLCanvasElement;
  submitCount(): number;
  writes(): readonly CapturedWrite[];
  draws(): readonly CapturedDraw[];
  restore(): void;
}

const globalStubs: ReadonlyArray<readonly [string, unknown]> = [
  ['GPUBufferUsage', { COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8, STORAGE: 16, COPY_SRC: 32 }],
  ['GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 }],
  ['GPUColorWrite', { ALL: 0xf }],
  ['GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 }],
];

const captureWriteBytes = (data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): Uint8Array => {
  if (data instanceof ArrayBuffer) {
    const byteOffset = dataOffset ?? 0;
    const byteLength = size ?? data.byteLength - byteOffset;

    return new Uint8Array(data.slice(byteOffset, byteOffset + byteLength));
  }

  const view = data as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number; BYTES_PER_ELEMENT?: number };
  const elementBytes = view.BYTES_PER_ELEMENT ?? 1;
  const start = view.byteOffset + (dataOffset ?? 0) * elementBytes;
  const length = size !== undefined ? size * elementBytes : view.byteLength - (dataOffset ?? 0) * elementBytes;

  return new Uint8Array(view.buffer.slice(start, start + length));
};

const createMockWebGpuEnvironment = (): MockWebGpuEnvironment => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousGlobals = globalStubs.map(([name]) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const previousCanvasGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');

  let submitCount = 0;
  const writes: CapturedWrite[] = [];
  const draws: CapturedDraw[] = [];

  const glyphCtx = {
    font: '',
    textBaseline: 'alphabetic',
    fillStyle: '#ffffff',
    measureText: (_text: string) =>
      ({
        width: 10,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 9,
        actualBoundingBoxAscent: 13,
        actualBoundingBoxDescent: 3,
        fontBoundingBoxAscent: 14,
        fontBoundingBoxDescent: 4,
      }) as TextMetrics,
    fillText: (): void => {},
    clearRect: (): void => {},
    fillRect: (): void => {},
    drawImage: (): void => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  } as unknown as CanvasRenderingContext2D;

  const pass = {
    setPipeline: (): void => {},
    setBindGroup: (): void => {},
    setVertexBuffer: (): void => {},
    setIndexBuffer: (): void => {},
    setScissorRect: (): void => {},
    pushDebugGroup: (): void => {},
    popDebugGroup: (): void => {},
    draw: (): void => {},
    drawIndexed: (indexCount: number, instanceCount: number): void => {
      draws.push({ indexCount, instanceCount });
    },
    end: (): void => {},
  };
  const encoder = {
    beginRenderPass: () => pass,
    finish: () => ({ label: 'command-buffer' }) as unknown as GPUCommandBuffer,
  };
  const queue = {
    writeBuffer: (buffer: LabeledBuffer, bufferOffset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void => {
      writes.push({ label: buffer.label, bufferOffset, bytes: captureWriteBytes(data, dataOffset, size) });
    },
    submit: (): void => {
      submitCount++;
    },
    copyExternalImageToTexture: (): void => {},
    writeTexture: (): void => {},
  };
  const device = {
    createShaderModule: () => ({}) as GPUShaderModule,
    createBindGroupLayout: () => ({}) as GPUBindGroupLayout,
    createPipelineLayout: () => ({}) as GPUPipelineLayout,
    createBindGroup: () => ({}) as GPUBindGroup,
    createRenderPipeline: () => ({}) as GPURenderPipeline,
    createCommandEncoder: () => encoder as unknown as GPUCommandEncoder,
    createBuffer: (descriptor: GPUBufferDescriptor): GPUBuffer =>
      ({
        label: descriptor.label ?? '',
        destroy: (): void => {},
      }) as unknown as GPUBuffer,
    createTexture: (): GPUTexture => {
      const view = {} as GPUTextureView;

      return {
        destroy: (): void => {},
        createView: () => view,
      } as unknown as GPUTexture;
    },
    createSampler: () => ({}) as GPUSampler,
    lost: new Promise<GPUDeviceLostInfo>(() => {}),
    queue,
  } as unknown as GPUDevice;
  const context = {
    configure: (): void => {},
    unconfigure: (): void => {},
    getCurrentTexture: () =>
      ({
        createView: () => ({}) as GPUTextureView,
      }) as unknown as GPUTexture,
  } as unknown as GPUCanvasContext;
  const gpu = {
    requestAdapter: async () =>
      ({
        requestDevice: async () => device,
      }) as unknown as GPUAdapter,
    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
  } as unknown as GPU;
  const canvas = document.createElement('canvas');

  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });

  for (const [name, value] of globalStubs) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }

  // Glyph rasterization (GlyphAtlas) creates its OWN canvases and reads a '2d'
  // context — stub it at the prototype level. The WebGPU surface canvas below
  // shadows this with an instance-level override for 'webgpu'.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: (type: string) => (type === '2d' ? glyphCtx : null),
  });

  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: (contextType: string) => (contextType === 'webgpu' ? context : null),
  });

  return {
    canvas,
    submitCount: () => submitCount,
    writes: () => writes,
    draws: () => draws,
    restore: (): void => {
      if (previousGpu) {
        Object.defineProperty(navigator, 'gpu', previousGpu);
      } else {
        Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      }

      for (const [name, descriptor] of previousGlobals) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
        }
      }

      if (previousCanvasGetContext) {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', previousCanvasGetContext);
      }
    },
  };
};

const createBackend = async (environment: MockWebGpuEnvironment): Promise<WebGpuBackend> => {
  const app = {
    canvas: environment.canvas,
    options: {
      canvas: { width: 128, height: 128 },
      clearColor: Color.black,
    },
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  materializeRendererBindings(backend, buildCoreRendererBindings({}));
  await backend.initialize();

  return backend;
};

const renderFrame = (backend: WebGpuBackend, root: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

const instanceLabel = 'sprite:retained-instance-buffer';
const sharedTransformLabel = 'sprite:retained-transform-buffer';
const nodeDataLabel = 'WebGpuTextRenderer/retained-node-data';
const textUniformLabel = 'WebGpuTextRenderer/retained-uniform';

const countLabel = (writes: readonly CapturedWrite[], label: string, from = 0): number => {
  let count = 0;

  for (let index = from; index < writes.length; index++) {
    if (writes[index]!.label === label) {
      count++;
    }
  }

  return count;
};

/** "Hi" → 2 glyphs → 2 quads → 8 vertices, 12 indices (matches the existing webgpu-backend.test.ts fixture). */
const buildTextGroup = (): { root: Container; group: RetainedContainer; text: Text } => {
  const root = new Container();
  const group = new RetainedContainer();
  const text = new Text('Hi', { fontSize: 16 });

  group.setPosition(8, 8);
  group.addChild(text);
  root.addChild(group);

  return { root, group, text };
};

describe('WebGPU Text retained-batch record/replay', () => {
  test('opts in, records on the second clean frame, replays without re-collecting glyph quads', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const { root, group } = buildTextGroup();

      expect(new WebGpuTextRenderer()._supportsRetainedBatches).toBe(true);

      renderFrame(backend, root); // F1: capture (no recording yet)

      expect(fragmentOf(group).instructions).toBeNull();

      renderFrame(backend, root); // F2: record

      const recordedSet = fragmentOf(group).instructions;

      expect(recordedSet?.hasRecording).toBe(true);
      expect(countLabel(environment.writes(), instanceLabel)).toBe(1);
      expect(countLabel(environment.writes(), nodeDataLabel)).toBe(0); // uploaded lazily, on first REPLAY

      // A Text-only capture must never issue the shared-transform-row copy —
      // the WebGpuBackend._finalizeRetainedCapture guard this task added.
      expect(countLabel(environment.writes(), sharedTransformLabel)).toBe(0);

      const drawsBefore = environment.draws().length;

      renderFrame(backend, root); // F3: replay

      expect(countLabel(environment.writes(), nodeDataLabel)).toBe(1); // first replay uploads once
      expect(countLabel(environment.writes(), textUniformLabel)).toBeGreaterThanOrEqual(1);

      const replayDraws = environment.draws().slice(drawsBefore);

      expect(replayDraws).toEqual([{ indexCount: 12, instanceCount: 1 }]);

      const mark = environment.writes().length;

      renderFrame(backend, root); // F4: static replay — no node-data re-upload

      expect(countLabel(environment.writes(), nodeDataLabel, mark)).toBe(0);
      expect(countLabel(environment.writes(), instanceLabel, mark)).toBe(0);
      expect(fragmentOf(group).instructions).toBe(recordedSet);

      root.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('camera pan and group move replay without touching recorded vertex or node-data bytes', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const { root, group } = buildTextGroup();

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record
      renderFrame(backend, root); // F3: replay (first node-data upload)

      const recordedSet = fragmentOf(group).instructions;

      expect(recordedSet?.hasRecording).toBe(true);

      group.setPosition(40, 40);

      let mark = environment.writes().length;

      renderFrame(backend, root);

      expect(fragmentOf(group).instructions).toBe(recordedSet);
      expect(countLabel(environment.writes(), instanceLabel, mark)).toBe(0);
      expect(countLabel(environment.writes(), nodeDataLabel, mark)).toBe(0);
      expect(countLabel(environment.writes(), textUniformLabel, mark)).toBe(1);

      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      mark = environment.writes().length;

      renderFrame(backend, root);

      expect(countLabel(environment.writes(), instanceLabel, mark)).toBe(0);
      expect(countLabel(environment.writes(), nodeDataLabel, mark)).toBe(0);
      expect(countLabel(environment.writes(), textUniformLabel, mark)).toBe(1);

      root.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an own-transform move patches the node-data row in place (O(1)) — no re-record', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const { root, group, text } = buildTextGroup();

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record
      renderFrame(backend, root); // F3: replay (first node-data upload)

      const recordedSet = fragmentOf(group).instructions;
      const bundle = recordedSet?.ownedBundle as WebGpuRetainedGroupBundle;

      expect(recordedSet?.hasRecording).toBe(true);
      expect(bundle).toBeInstanceOf(WebGpuRetainedGroupBundle);

      const generation = bundle.generation;
      const mark = environment.writes().length;

      text.setPosition(4, 4);
      renderFrame(backend, root);

      // No re-record: neither the vertex stream nor the whole node-data block
      // is re-uploaded.
      expect(countLabel(environment.writes(), instanceLabel, mark)).toBe(0);

      // Exactly one small patch write into the node-data buffer: 2 vec4s (32
      // bytes) at the moved node's row offset (row 0, the only node).
      const patchWrites = environment
        .writes()
        .slice(mark)
        .filter(write => write.label === nodeDataLabel);

      expect(patchWrites).toHaveLength(1);
      expect(patchWrites[0]!.bytes.byteLength).toBe(32);
      expect(patchWrites[0]!.bufferOffset).toBe(0);

      expect(bundle.generation).toBe(generation);
      expect(fragmentOf(group).instructions).toBe(recordedSet);
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      root.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a content change forces a full re-record', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const { root, group, text } = buildTextGroup();

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record

      const recordedSet = fragmentOf(group).instructions;

      expect(recordedSet?.hasRecording).toBe(true);

      text.text = 'Hi!';
      renderFrame(backend, root); // F3: content-dirty — drops the recording

      expect(fragmentOf(group).instructions?.hasRecording).not.toBe(true);

      renderFrame(backend, root); // F4: re-record against the new content

      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      root.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a flush producing more than one (shaderType, atlasTexture) batch poisons the capture instead of recording it', async () => {
    const environment = createMockWebGpuEnvironment();
    // Force the multi-batch branch deterministically (getting real content to
    // land in two distinct atlas pages/shader types in one flush is an
    // implementation detail of glyph packing this test shouldn't depend on):
    // duplicate whatever batches[] a real flush actually produced before
    // handing it to the private recorder this task added.
    const originalTryRecord = (
      WebGpuTextRenderer.prototype as unknown as {
        _tryRecordRetainedBatch: (this: WebGpuTextRenderer, backend: WebGpuBackend, batches: readonly unknown[]) => void;
      }
    )._tryRecordRetainedBatch;

    try {
      const backend = await createBackend(environment);
      const { root, group } = buildTextGroup();

      (
        WebGpuTextRenderer.prototype as unknown as {
          _tryRecordRetainedBatch: (this: WebGpuTextRenderer, backend: WebGpuBackend, batches: readonly unknown[]) => void;
        }
      )._tryRecordRetainedBatch = function (backend: WebGpuBackend, batches: readonly unknown[]): void {
        originalTryRecord.call(this, backend, [...batches, ...batches]);
      };

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: would-be record — poisoned instead (synthetic 2-batch flush)

      const set = fragmentOf(group).instructions;

      // A poisoned window's plan-level key still looks committed
      // (`hasRecording`/`isValidFor`) — the backend applies its own veto on
      // top (mirrors the existing Sprite poison test in
      // webgpu-retained-record-replay.test.ts): `_validateRetainedInstructionSet`
      // must reject it so the group never replays the incomplete recording.
      expect(set?.hasRecording).toBe(true);
      expect(set !== null && set !== undefined && backend._validateRetainedInstructionSet(set)).toBe(false);

      // Still renders correctly every frame (entry replay), never crashes.
      const drawsBefore = environment.draws().length;

      renderFrame(backend, root);

      expect(environment.draws().length).toBeGreaterThan(drawsBefore);

      root.destroy();
      backend.destroy();
    } finally {
      (WebGpuTextRenderer.prototype as unknown as { _tryRecordRetainedBatch: unknown })._tryRecordRetainedBatch = originalTryRecord;
      environment.restore();
    }
  });

  describe('deliberate-break mutation proofs', () => {
    test('a neutered _replayRetainedBatch stops issuing the retained draw', async () => {
      const environment = createMockWebGpuEnvironment();
      const original = WebGpuTextRenderer.prototype._replayRetainedBatch;

      try {
        const backend = await createBackend(environment);
        const { root, group } = buildTextGroup();

        renderFrame(backend, root); // F1: capture
        renderFrame(backend, root); // F2: record

        expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

        WebGpuTextRenderer.prototype._replayRetainedBatch = function (): void {};

        const drawsBefore = environment.draws().length;

        renderFrame(backend, root); // F3: would-be replay — neutered, draws nothing

        expect(environment.draws().slice(drawsBefore)).toEqual([]);

        WebGpuTextRenderer.prototype._replayRetainedBatch = original;

        const drawsAfterRestore = environment.draws().length;

        renderFrame(backend, root); // F4: restored — replays again

        expect(environment.draws().slice(drawsAfterRestore)).toEqual([{ indexCount: 12, instanceCount: 1 }]);

        root.destroy();
        backend.destroy();
      } finally {
        WebGpuTextRenderer.prototype._replayRetainedBatch = original;
        environment.restore();
      }
    });

    test('a neutered _patchOwnTransformRow forces a full re-record instead of the O(1) patch', async () => {
      const environment = createMockWebGpuEnvironment();
      const original = WebGpuTextRenderer.prototype._patchOwnTransformRow;

      try {
        const backend = await createBackend(environment);
        const { root, group, text } = buildTextGroup();

        renderFrame(backend, root); // F1: capture
        renderFrame(backend, root); // F2: record
        renderFrame(backend, root); // F3: replay

        expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

        WebGpuTextRenderer.prototype._patchOwnTransformRow = (): boolean => false;

        text.setPosition(4, 4);

        let mark = environment.writes().length;

        // `_tryPatchTransformRow` (RetainedContainer) invalidates the
        // recording the SAME frame it discovers the patch is ineligible, and
        // the fragment is still content/structure-clean, so it re-records
        // immediately within this one `renderFrame` call (no extra frame
        // needed) — a full re-record re-uploads the vertex stream, which the
        // cheap O(1) patch never touches.
        renderFrame(backend, root);

        expect(countLabel(environment.writes(), instanceLabel, mark)).toBeGreaterThan(0);
        expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

        WebGpuTextRenderer.prototype._patchOwnTransformRow = original;

        renderFrame(backend, root); // replay the fresh recording once

        const bundle = fragmentOf(group).instructions?.ownedBundle as WebGpuRetainedGroupBundle;
        const generation = bundle.generation;

        mark = environment.writes().length;
        text.setPosition(8, 8);
        renderFrame(backend, root); // restored — O(1) patch again, no re-record

        expect(bundle.generation).toBe(generation);
        expect(countLabel(environment.writes(), instanceLabel, mark)).toBe(0);
        expect(countLabel(environment.writes(), nodeDataLabel, mark)).toBe(1);

        root.destroy();
        backend.destroy();
      } finally {
        WebGpuTextRenderer.prototype._patchOwnTransformRow = original;
        environment.restore();
      }
    });
  });
});
