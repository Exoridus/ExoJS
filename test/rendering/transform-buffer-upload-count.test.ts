import { Color } from '#core/Color';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, drawCommandUsesSharedTransform, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { RenderGroup } from '#rendering/plan/RenderInstruction';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { DrawScopeEntry, GroupScope } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import { TransformBuffer } from '#rendering/TransformBuffer';
import { WebGpuTransformStorage } from '#rendering/webgpu/WebGpuTransformStorage';

// Sprite/Mesh-like: renderer reads the shared transform storage.
class ConsumingDrawable extends Drawable {
  public constructor(x: number, y: number, tint: Color) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

// Text/Particle-like: renderer packs its own per-node data and opts out.
class NonConsumingDrawable extends Drawable {
  public constructor(x: number, y: number, tint: Color) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

const consumingRenderer = {};
const nonConsumingRenderer = { _consumesSharedTransform: false };

const makeRegistry = () => ({
  resolve(drawable: Drawable): unknown {
    return drawable instanceof NonConsumingDrawable ? nonConsumingRenderer : consumingRenderer;
  },
});

const material = (key: number): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: key,
  bindKey: key,
});

// One coalescing group: every command shares the same groupIndex/material key,
// so `collectRenderGroups` packs them into a single RenderGroup → a single
// upload boundary fires for the whole run.
const createDrawCommand = (drawable: Drawable, nodeIndex: number): DrawCommand => ({
  kind: RenderEntryKind.Draw,
  drawable,
  nodeIndex,
  seq: nodeIndex,
  zIndex: 0,
  material: material(1),
  groupIndex: 1,
  minX: 0,
  minY: 0,
  maxX: 16,
  maxY: 16,
});

const drawEntry = (command: DrawCommand): DrawScopeEntry => ({
  kind: RenderEntryKind.Draw,
  seq: command.seq,
  zIndex: command.zIndex,
  command,
});

const groupScope = (entries: DrawScopeEntry[]): GroupScope => ({
  kind: RenderEntryKind.Group,
  entries,
  hasMixedZ: false,
  preserveDrawOrder: false,
});

// ---------------------------------------------------------------------------
// WebGL2 upload-boundary model.
//
// Faithfully mirrors WebGl2Backend: `_prepareRenderGroupUpload` packs the whole
// group through the production `drawCommandUsesSharedTransform` predicate, and a
// flush (mirroring `bindTransformBufferTexture`) commits a snapshot and records
// exactly one upload — but only when the snapshot changed. The real GL texture
// commit needs a GL context; the upload accounting it performs does not, so the
// counter invariants are reproduced 1:1 here without a browser.
// ---------------------------------------------------------------------------

class Webgl2UploadModel {
  public readonly buffer = new TransformBuffer();
  private _textureHash = 0;
  private _textureCount = -1;

  public begin(nodeCount: number): void {
    this.buffer.begin(nodeCount);
  }

  public play(scope: GroupScope): void {
    const buffer = this.buffer;
    const backend = {
      rendererRegistry: makeRegistry(),
      _prepareRenderGroupUpload(group: RenderGroup) {
        for (const command of group.instructions) {
          if (drawCommandUsesSharedTransform(command, this as unknown as RenderBackend)) {
            buffer.write(command.nodeIndex, command.drawable.getGlobalTransform(), command.drawable.tint);
          } else {
            buffer.recordSkippedWrite();
          }
        }
      },
      _prepareDrawCommand() {
        // Refactored backend contract: no transform write in this hook.
      },
      draw() {
        return this;
      },
    } as unknown as RenderBackend;

    RenderPlanPlayer.playScope(scope, backend);
  }

  // Mirror WebGl2Backend.bindTransformBufferTexture's upload accounting: commit
  // the frame snapshot, and only when it changed does the texture re-commit and
  // a single upload get recorded for `snapshot.count` rows.
  public flush(minCount = 0): void {
    const requiredCount = Math.max(1, minCount);
    const snapshot = this.buffer.commitSnapshot(requiredCount);

    if (snapshot.changed || snapshot.count !== this._textureCount || snapshot.hash !== this._textureHash) {
      this.buffer.recordUpload(snapshot.count);
      this._textureHash = snapshot.hash;
      this._textureCount = snapshot.count;
    }
  }
}

// ---------------------------------------------------------------------------
// WebGPU upload-boundary model.
//
// Uses the real WebGpuTransformStorage with a minimal mock device — the same
// fake-device pattern as the reserve test — so the production
// `getBuffer` → `commitSnapshot` → `recordUpload` path runs unchanged.
// ---------------------------------------------------------------------------

interface MockBuffer {
  destroy: () => void;
}

interface MockDevice {
  createBuffer: () => GPUBuffer;
  queue: { writeBuffer: () => void };
}

const createMockDevice = (): MockDevice => ({
  createBuffer: () => ({ destroy: () => {} }) as unknown as GPUBuffer,
  queue: { writeBuffer: () => {} },
});

const withGpuBufferUsage = (run: () => void): void => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    configurable: true,
    value: { STORAGE: 128, COPY_DST: 8 },
  });

  try {
    run();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'GPUBufferUsage', previous);
    } else {
      Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: undefined });
    }
  }
};

const playWebgpu = (storage: WebGpuTransformStorage, scope: GroupScope): void => {
  const backend = {
    rendererRegistry: makeRegistry(),
    _prepareRenderGroupUpload(group: RenderGroup) {
      for (const command of group.instructions) {
        if (drawCommandUsesSharedTransform(command, this as unknown as RenderBackend)) {
          storage.writeCommand(command);
        } else {
          storage.recordSkippedWrite();
        }
      }
    },
    _prepareDrawCommand() {},
    draw() {
      return this;
    },
  } as unknown as RenderBackend;

  RenderPlanPlayer.playScope(scope, backend);
};

// ---------------------------------------------------------------------------
// Scenarios.
// ---------------------------------------------------------------------------

// N consuming draws coalescing into one render group, each on its own
// nodeIndex slot. Stable factory so identical-transform replays match.
const buildConsumingScope = (n: number): GroupScope => {
  const entries: DrawScopeEntry[] = [];

  for (let i = 0; i < n; i++) {
    const d = new ConsumingDrawable(10 + i * 10, 20 + i * 10, new Color(10 + i, 20 + i, 30 + i, 0.1));

    entries.push(drawEntry(createDrawCommand(d, i)));
  }

  return groupScope(entries);
};

// K consuming + M opt-out draws, interleaved, all in one coalescing group.
// Consuming nodes occupy the lowest slots so `count === K`.
const buildMixedScope = (consumingCount: number, optOutCount: number): GroupScope => {
  const entries: DrawScopeEntry[] = [];
  let nodeIndex = 0;

  for (let i = 0; i < consumingCount; i++) {
    const d = new ConsumingDrawable(10 + i * 10, 20 + i * 10, new Color(10 + i, 20 + i, 30 + i, 0.2));

    entries.push(drawEntry(createDrawCommand(d, nodeIndex++)));
  }

  for (let i = 0; i < optOutCount; i++) {
    const t = new NonConsumingDrawable(200 + i * 10, 200 + i * 10, new Color(50 + i, 60 + i, 70 + i, 0.3));

    entries.push(drawEntry(createDrawCommand(t, nodeIndex++)));
  }

  return groupScope(entries);
};

describe('transform buffer group upload count (WebGL2 path)', () => {
  test('N consuming draws in one render group → exactly one upload of N records', () => {
    const n = 5;
    const model = new Webgl2UploadModel();

    model.begin(n);
    model.play(buildConsumingScope(n));
    model.flush(n);

    // One coalesced group → one pack → one upload boundary.
    expect(model.buffer.uploadCount).toBe(1);
    expect(model.buffer.uploadedRecordCount).toBe(n);
    expect(model.buffer.writeCount).toBe(n);
    expect(model.buffer.skippedWriteCount).toBe(0);
  });

  test('replaying identical transforms → snapshot unchanged → zero additional uploads', () => {
    const n = 4;
    const model = new Webgl2UploadModel();

    // Frame 1: first upload.
    model.begin(n);
    model.play(buildConsumingScope(n));
    model.flush(n);

    expect(model.buffer.uploadCount).toBe(1);

    // Frame 2: identical transforms. begin() resets the per-frame upload
    // counter; the snapshot is unchanged so the flush records no upload.
    model.begin(n);
    model.play(buildConsumingScope(n));
    const snapshot = model.buffer.commitSnapshot(n);

    expect(snapshot.changed).toBe(false);

    // Re-pack and flush exactly as a real second frame would; still no upload.
    model.begin(n);
    model.play(buildConsumingScope(n));
    model.flush(n);

    expect(model.buffer.uploadCount).toBe(0);
  });

  test('mixed consuming/opt-out group → skippedWriteCount === M, uploadedRecordCount === K', () => {
    const consuming = 3;
    const optOut = 2;
    const model = new Webgl2UploadModel();

    model.begin(consuming + optOut);
    model.play(buildMixedScope(consuming, optOut));
    // Flush with the number of packed (consuming) rows as the floor: opt-out
    // commands occupy the highest node indices but never write a slot, so the
    // packed count is exactly K and the upload pushes K records.
    model.flush(consuming);

    expect(model.buffer.writeCount).toBe(consuming);
    expect(model.buffer.skippedWriteCount).toBe(optOut);
    expect(model.buffer.count).toBe(consuming);
    expect(model.buffer.uploadCount).toBe(1);
    expect(model.buffer.uploadedRecordCount).toBe(consuming);
  });

  test('a group of only opt-out draws records every skip and packs no rows', () => {
    const optOut = 3;
    const model = new Webgl2UploadModel();

    model.begin(optOut);
    model.play(buildMixedScope(0, optOut));

    // Every opt-out command is skipped; no slot is ever written.
    expect(model.buffer.writeCount).toBe(0);
    expect(model.buffer.skippedWriteCount).toBe(optOut);
    expect(model.buffer.count).toBe(0);

    // The flush still commits the frame's snapshot once (the per-frame floor of
    // `max(1, minCount)` rows); the upload pushes that floor, not the opt-out
    // count — opt-out rows are never part of the shared buffer.
    model.flush();

    expect(model.buffer.uploadCount).toBe(1);
    expect(model.buffer.uploadedRecordCount).toBe(1);
  });
});

describe('transform buffer group upload count (WebGPU path)', () => {
  test('N consuming draws in one render group → exactly one upload of N records', () => {
    withGpuBufferUsage(() => {
      const n = 5;
      const device = createMockDevice() as unknown as GPUDevice;
      const storage = new WebGpuTransformStorage();

      storage.begin(n);
      storage.reserve(device, n);
      playWebgpu(storage, buildConsumingScope(n));
      storage.getBuffer(device, n);

      expect(storage.buffer.uploadCount).toBe(1);
      expect(storage.buffer.uploadedRecordCount).toBe(n);
      expect(storage.buffer.writeCount).toBe(n);
      expect(storage.buffer.skippedWriteCount).toBe(0);
    });
  });

  test('replaying identical transforms → snapshot unchanged → zero additional uploads', () => {
    withGpuBufferUsage(() => {
      const n = 4;
      const device = createMockDevice() as unknown as GPUDevice;
      const storage = new WebGpuTransformStorage();

      // Frame 1.
      storage.begin(n);
      storage.reserve(device, n);
      playWebgpu(storage, buildConsumingScope(n));
      storage.getBuffer(device, n);

      expect(storage.buffer.uploadCount).toBe(1);

      // Frame 2: identical transforms → unchanged snapshot → no upload.
      storage.begin(n);
      playWebgpu(storage, buildConsumingScope(n));
      storage.getBuffer(device, n);

      expect(storage.buffer.uploadCount).toBe(0);
    });
  });

  test('mixed consuming/opt-out group → skippedWriteCount === M, uploadedRecordCount === K', () => {
    withGpuBufferUsage(() => {
      const consuming = 3;
      const optOut = 2;
      const device = createMockDevice() as unknown as GPUDevice;
      const storage = new WebGpuTransformStorage();

      storage.begin(consuming + optOut);
      storage.reserve(device, consuming + optOut);
      playWebgpu(storage, buildMixedScope(consuming, optOut));
      storage.getBuffer(device, consuming);

      expect(storage.buffer.writeCount).toBe(consuming);
      expect(storage.buffer.skippedWriteCount).toBe(optOut);
      expect(storage.buffer.count).toBe(consuming);
      expect(storage.buffer.uploadCount).toBe(1);
      expect(storage.buffer.uploadedRecordCount).toBe(consuming);
    });
  });
});
