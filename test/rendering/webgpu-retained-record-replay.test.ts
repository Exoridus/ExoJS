/**
 * WebGPU retained instruction-set record/replay (Track B Slice 3, Tasks 9/10).
 *
 * Drives the REAL WebGpuBackend + sprite renderer + plan pipeline against a
 * mock device that counts queue submits, captures writeBuffer payloads by
 * buffer label, and records drawIndexed instance counts. Pins:
 *
 * - the fallback ladder end-to-end on the real backend: dirty collect →
 *   clean entry-replay frame records → next clean frame replays O(batches),
 * - B-06: a cached frame with N retained groups submits exactly ONCE (the
 *   uncached path splits at every distinct group matrix, i.e. >= N),
 * - replay reuses only group-owned resources: zero instance-arena and zero
 *   shared transform-storage uploads on cached frames,
 * - node indices in the recorded bytes are rebased group-local (immune to
 *   frame-global index shifts from dynamic siblings),
 * - the per-group 128-byte UBO is written once on first replay, skipped on
 *   static frames, and rewritten exactly once per camera/group-matrix change,
 * - grow-only bundle reuse: a same-size recapture keeps the generation, a
 *   growing recapture bumps it (stale outer references fail validation),
 * - texture-view identity validation (S3-D3): a texture resize drops the
 *   recording, the same frame falls back to entry replay AND re-records, the
 *   next frame replays again,
 * - the poison veto: a capture window that saw unrecordable work never
 *   yields a replayable set.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuRetainedGroupBundle } from '#rendering/webgpu/WebGpuRetainedGroupResources';

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

  // ArrayBufferView variant: dataOffset/size are in ELEMENTS of the view type.
  const view = data as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number; BYTES_PER_ELEMENT?: number };
  const elementBytes = view.BYTES_PER_ELEMENT ?? 1;
  const start = view.byteOffset + (dataOffset ?? 0) * elementBytes;
  const length = size !== undefined ? size * elementBytes : view.byteLength - (dataOffset ?? 0) * elementBytes;

  return new Uint8Array(view.buffer.slice(start, start + length));
};

const createMockWebGpuEnvironment = (): MockWebGpuEnvironment => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousGlobals = globalStubs.map(([name]) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

  let submitCount = 0;
  const writes: CapturedWrite[] = [];
  const draws: CapturedDraw[] = [];

  const pass = {
    setPipeline: (): void => {},
    setBindGroup: (): void => {},
    setVertexBuffer: (): void => {},
    setIndexBuffer: (): void => {},
    setScissorRect: (): void => {},
    pushDebugGroup: (): void => {},
    popDebugGroup: (): void => {},
    draw: (): void => {},
    drawIndexed: (_indexCount: number, instanceCount: number): void => {
      draws.push({ instanceCount });
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
      // A stable view per GPU texture, matching the backend's cached-view
      // contract (a fresh view identity means "texture was recreated").
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

const createCanvasTexture = (size = 16): Texture => {
  const sourceCanvas = document.createElement('canvas');

  sourceCanvas.width = size;
  sourceCanvas.height = size;

  const texture = new Texture(sourceCanvas);

  // Keep the frame to pure content passes (mipmap generation opens its own).
  texture.generateMipMap = false;
  texture.updateSource();

  return texture;
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

const retainedInstanceLabel = 'sprite:retained-instance-buffer';
const retainedTransformLabel = 'sprite:retained-transform-buffer';
const retainedUniformLabel = 'sprite:retained-uniform-buffer';
const arenaInstanceLabel = 'sprite:instance-buffer';
const sharedTransformLabel = 'transform:storage-buffer';

const countLabel = (writes: readonly CapturedWrite[], label: string, from = 0): number => {
  let count = 0;

  for (let index = from; index < writes.length; index++) {
    if (writes[index]!.label === label) {
      count++;
    }
  }

  return count;
};

/** Build `groupCount` retained groups (2 sprites each) at DISTINCT positions. */
const buildGroupScene = (texture: Texture, groupCount: number): { root: Container; groups: RetainedContainer[] } => {
  const root = new Container();
  const groups: RetainedContainer[] = [];

  for (let i = 0; i < groupCount; i++) {
    const group = new RetainedContainer();

    group.setPosition(8 + i * 24, 8);

    for (let s = 0; s < 2; s++) {
      const sprite = new Sprite(texture);

      sprite.setPosition(s * 8, 0);
      group.addChild(sprite);
    }

    groups.push(group);
    root.addChild(group);
  }

  return { root, groups };
};

describe('WebGPU retained record/replay: fallback ladder + B-06 submit collapse', () => {
  test('N cached groups replay in one submit; the uncached path splits at every distinct group matrix', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const texture = createCanvasTexture();
      const { root, groups } = buildGroupScene(texture, 3);

      // F1: dirty collect + fragment capture (no recording yet — record
      // arms on the first CLEAN frame).
      renderFrame(backend, root);

      expect(fragmentOf(groups[0]!).instructions).toBeNull();

      // F2: clean entry replay + record. The uncached path pays one pass
      // split per distinct group matrix — this is the pre-B-06 cost.
      const submitsBeforeRecord = environment.submitCount();

      renderFrame(backend, root);

      const recordSubmits = environment.submitCount() - submitsBeforeRecord;

      expect(recordSubmits).toBeGreaterThanOrEqual(3);
      expect(fragmentOf(groups[0]!).instructions?.hasRecording).toBe(true);
      expect(fragmentOf(groups[2]!).instructions?.hasRecording).toBe(true);
      // Each group's bundle received its instance bytes + transform rows.
      expect(countLabel(environment.writes(), retainedInstanceLabel)).toBe(3);
      expect(countLabel(environment.writes(), retainedTransformLabel)).toBe(3);

      // F3: cached path — all three groups replay into ONE open pass, ONE
      // submit (B-06 fixed), with the recorded instance counts.
      const submitsBeforeReplay = environment.submitCount();
      const writesBeforeReplay = environment.writes().length;
      const drawsBeforeReplay = environment.draws().length;

      renderFrame(backend, root);

      expect(environment.submitCount() - submitsBeforeReplay).toBe(1);

      const replayDraws = environment.draws().slice(drawsBeforeReplay);

      expect(replayDraws).toHaveLength(3);
      expect(replayDraws.every(draw => draw.instanceCount === 2)).toBe(true);

      // Replay reads only group-owned buffers: no instance-arena upload, no
      // shared transform-storage upload, no re-record.
      expect(countLabel(environment.writes(), arenaInstanceLabel, writesBeforeReplay)).toBe(0);
      expect(countLabel(environment.writes(), sharedTransformLabel, writesBeforeReplay)).toBe(0);
      expect(countLabel(environment.writes(), retainedInstanceLabel, writesBeforeReplay)).toBe(0);
      // Each bundle's 128-byte UBO is written once on its first replay.
      expect(countLabel(environment.writes(), retainedUniformLabel, writesBeforeReplay)).toBe(3);

      // F4: static cached frame — zero uniform writes, still one submit.
      const submitsBeforeStatic = environment.submitCount();
      const writesBeforeStatic = environment.writes().length;

      renderFrame(backend, root);

      expect(environment.submitCount() - submitsBeforeStatic).toBe(1);
      expect(countLabel(environment.writes(), retainedUniformLabel, writesBeforeStatic)).toBe(0);

      // Stats parity on the cached frame: 3 batches / 3 draw calls / 6 nodes.
      expect(backend.stats.batches).toBe(3);
      expect(backend.stats.drawCalls).toBe(3);
      expect(backend.stats.submittedNodes).toBe(6);

      root.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('recorded node indices are rebased group-local despite a dynamic sibling shifting frame-global slots', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const texture = createCanvasTexture();
      const root = new Container();
      const sibling = new Sprite(texture);
      const group = new RetainedContainer();

      sibling.setPosition(100, 100);
      root.addChild(sibling); // collected BEFORE the group: shifts the group's frame-global rows

      for (let s = 0; s < 2; s++) {
        const sprite = new Sprite(texture);

        sprite.setPosition(s * 8, 0);
        group.addChild(sprite);
      }

      root.addChild(group);

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record

      const instanceWrites = environment.writes().filter(write => write.label === retainedInstanceLabel);

      expect(instanceWrites).toHaveLength(1);

      // Two 36-byte instances; word 8 of each is the (rebased) node index.
      const words = new Uint32Array(instanceWrites[0]!.bytes.buffer, instanceWrites[0]!.bytes.byteOffset, instanceWrites[0]!.bytes.byteLength / 4);

      expect(words).toHaveLength(18);
      expect(words[8]).toBe(0);
      expect(words[17]).toBe(1);

      // The group-owned transform copy covers exactly the group's 2 rows.
      const transformWrites = environment.writes().filter(write => write.label === retainedTransformLabel);

      expect(transformWrites).toHaveLength(1);
      expect(transformWrites[0]!.bufferOffset).toBe(0);
      expect(transformWrites[0]!.bytes.byteLength).toBe(2 * 48);

      root.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a group move and a camera pan rewrite the group UBO exactly once each — without recapture', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const texture = createCanvasTexture();
      const { root, groups } = buildGroupScene(texture, 1);
      const group = groups[0]!;

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record
      renderFrame(backend, root); // F3: replay (first UBO write)

      const recordedSet = fragmentOf(group).instructions;

      expect(recordedSet?.hasRecording).toBe(true);

      // Group move: replay continues (no recapture), UBO rewritten once.
      group.setPosition(40, 40);

      let mark = environment.writes().length;

      renderFrame(backend, root);

      expect(fragmentOf(group).instructions).toBe(recordedSet);
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);
      expect(countLabel(environment.writes(), retainedInstanceLabel, mark)).toBe(0); // no re-record
      expect(countLabel(environment.writes(), retainedUniformLabel, mark)).toBe(1);

      // Camera pan: same story — live view, one UBO rewrite, no recapture.
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      mark = environment.writes().length;

      renderFrame(backend, root);

      expect(countLabel(environment.writes(), retainedInstanceLabel, mark)).toBe(0);
      expect(countLabel(environment.writes(), retainedUniformLabel, mark)).toBe(1);

      // And a static frame after both: zero UBO writes.
      mark = environment.writes().length;

      renderFrame(backend, root);

      expect(countLabel(environment.writes(), retainedUniformLabel, mark)).toBe(0);

      root.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('grow-only bundle: a same-size recapture keeps the generation, growth bumps it, replay resumes after both', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const texture = createCanvasTexture();
      const { root, groups } = buildGroupScene(texture, 1);
      const group = groups[0]!;
      const mover = group.children[0] as Sprite;

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record

      const bundle = fragmentOf(group).instructions?.ownedBundle;

      expect(bundle).toBeInstanceOf(WebGpuRetainedGroupBundle);

      const initialGeneration = (bundle as WebGpuRetainedGroupBundle).generation;

      renderFrame(backend, root); // F3: replay

      // Same-shaped recapture (child move): buffers are reused in place.
      mover.setPosition(4, 4);
      renderFrame(backend, root); // dirty collect
      renderFrame(backend, root); // re-record into the SAME buffers

      expect(fragmentOf(group).instructions?.ownedBundle).toBe(bundle);
      expect((bundle as WebGpuRetainedGroupBundle).generation).toBe(initialGeneration);

      // Growing recapture: 12 instances (432 B) exceed the initial 256 B
      // instance capacity — the buffer is recreated and the generation bumps.
      for (let i = 0; i < 10; i++) {
        const sprite = new Sprite(texture);

        sprite.setPosition(i, i);
        group.addChild(sprite);
      }

      renderFrame(backend, root); // dirty collect
      renderFrame(backend, root); // re-record (growth)

      expect((bundle as WebGpuRetainedGroupBundle).generation).toBeGreaterThan(initialGeneration);
      expect(fragmentOf(group).instructions?.isValidFor(backend)).toBe(true);

      // And the grown set replays: one submit, one batch of 12.
      const drawsBefore = environment.draws().length;
      const submitsBefore = environment.submitCount();

      renderFrame(backend, root);

      expect(environment.submitCount() - submitsBefore).toBe(1);
      expect(environment.draws().slice(drawsBefore)).toEqual([{ instanceCount: 12 }]);

      root.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('texture resize (fresh managed view) fails validation, falls back cleanly and re-records the same frame (S3-D3)', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const sourceCanvas = document.createElement('canvas');

      sourceCanvas.width = 16;
      sourceCanvas.height = 16;

      const texture = new Texture(sourceCanvas);

      texture.generateMipMap = false;
      texture.updateSource();

      const { root, groups } = buildGroupScene(texture, 1);
      const group = groups[0]!;

      renderFrame(backend, root); // F1: capture
      renderFrame(backend, root); // F2: record
      renderFrame(backend, root); // F3: replay

      const recordedSet = fragmentOf(group).instructions;

      expect(recordedSet?.hasRecording).toBe(true);

      // Resize: the backend recreates the GPU texture → fresh view identity.
      // The recorded UV words are stale against the new texture, so the set
      // must NOT replay. No node revision bumps here — only the backend-side
      // validation catches this.
      sourceCanvas.width = 32;
      sourceCanvas.height = 32;
      texture.updateSource();

      const mark = environment.writes().length;
      const drawsBefore = environment.draws().length;

      renderFrame(backend, root);

      // The fallback frame drew live (arena upload) AND re-recorded, so the
      // fast tier resumes immediately.
      expect(countLabel(environment.writes(), arenaInstanceLabel, mark)).toBeGreaterThan(0);
      expect(countLabel(environment.writes(), retainedInstanceLabel, mark)).toBe(1);
      expect(environment.draws().length).toBeGreaterThan(drawsBefore);
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      // Next frame: replay again, one submit, no live uploads.
      const replayMark = environment.writes().length;
      const submitsBefore = environment.submitCount();

      renderFrame(backend, root);

      expect(environment.submitCount() - submitsBefore).toBe(1);
      expect(countLabel(environment.writes(), arenaInstanceLabel, replayMark)).toBe(0);

      root.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a poisoned capture window never yields a replayable set (defensive veto)', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const set = new RetainedInstructionSet();

      set.beginRecording(backend);
      backend._beginRetainedCapture(set);
      backend._poisonActiveRetainedCaptures();
      backend._endRetainedCapture(set);
      set.commitRecording();

      // The plan-level key considers the set valid; the backend veto must not.
      expect(set.isValidFor(backend)).toBe(true);
      expect(backend._validateRetainedInstructionSet(set)).toBe(false);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});

describe('WebGpuRetainedGroupBundle: resource lifecycle', () => {
  // The bundle reads the GPUBufferUsage flags global (no full mock backend here).
  let previousGlobals: ReadonlyArray<readonly [string, PropertyDescriptor | undefined]> = [];

  beforeEach(() => {
    previousGlobals = globalStubs.map(([name]) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

    for (const [name, value] of globalStubs) {
      Object.defineProperty(globalThis, name, { configurable: true, value });
    }
  });

  afterEach(() => {
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
      }
    }
  });

  const createFakeDevice = (): { device: GPUDevice; created: string[]; destroyed: string[] } => {
    const created: string[] = [];
    const destroyed: string[] = [];
    const device = {
      createBuffer: (descriptor: GPUBufferDescriptor): GPUBuffer => {
        created.push(descriptor.label ?? '');

        return {
          label: descriptor.label ?? '',
          destroy: (): void => {
            destroyed.push(descriptor.label ?? '');
          },
        } as unknown as GPUBuffer;
      },
      createBindGroup: () => ({}) as GPUBindGroup,
    } as unknown as GPUDevice;

    return { device, created, destroyed };
  };

  test('device loss invalidates: buffers dropped without destroy, generation bumped, accounting freed', () => {
    const stats = createRenderStats();
    const accountant = new GpuResourceAccountant(stats);
    const bundle = new WebGpuRetainedGroupBundle(accountant, () => {});
    const { device, destroyed } = createFakeDevice();

    bundle.ensureCapacity(device, 100, 96);

    const generation = bundle.generation;

    expect(bundle.isReady).toBe(true);
    expect(stats.gpuMemoryBytes).toBeGreaterThan(0);

    bundle.invalidateDeviceState(false);

    expect(destroyed).toEqual([]); // dead-device buffers are not destroyed
    expect(bundle.isReady).toBe(false);
    expect(bundle.generation).toBeGreaterThan(generation);
    expect(stats.gpuMemoryBytes).toBe(0);
  });

  test('destroy releases buffers, bumps the generation, and unregisters once', () => {
    const stats = createRenderStats();
    const accountant = new GpuResourceAccountant(stats);
    let released = 0;
    const bundle = new WebGpuRetainedGroupBundle(accountant, () => {
      released++;
    });
    const { device, destroyed } = createFakeDevice();

    bundle.ensureCapacity(device, 100, 96);

    const generation = bundle.generation;

    bundle.destroy();

    expect(destroyed).toHaveLength(3); // instance + transform + uniform
    expect(bundle.generation).toBeGreaterThan(generation);
    expect(released).toBe(1);
    expect(stats.gpuMemoryBytes).toBe(0);

    bundle.destroy(); // idempotent: no double release

    expect(released).toBe(1);
  });

  test('growth recreates only the outgrown buffer and bumps the generation once per ensure', () => {
    const stats = createRenderStats();
    const accountant = new GpuResourceAccountant(stats);
    const bundle = new WebGpuRetainedGroupBundle(accountant, () => {});
    const { device, created } = createFakeDevice();

    bundle.ensureCapacity(device, 100, 96);

    const generation = bundle.generation;
    const createdAfterFirst = created.length;

    // Within capacity: nothing recreated, generation stable.
    bundle.ensureCapacity(device, 200, 96);

    expect(created.length).toBe(createdAfterFirst);
    expect(bundle.generation).toBe(generation);

    // Instance growth only: one new buffer, one generation bump.
    bundle.ensureCapacity(device, 4096, 96);

    expect(created.length).toBe(createdAfterFirst + 1);
    expect(bundle.generation).toBe(generation + 1);
  });
});
