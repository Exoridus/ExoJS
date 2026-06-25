import { Color } from '#core/Color';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, drawCommandUsesSharedTransform, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { DrawScopeEntry, GroupScope, ScopeEntry } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import { WebGpuTransformStorage } from '#rendering/webgpu/WebGpuTransformStorage';

import { forEachGroupCommand } from './helpers/collectRenderGroups';

// Sprite/Mesh-like: renderer reads shared transform storage.
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

const material = (key: number): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: key,
  bindKey: key,
});

const createDrawCommand = (drawable: Drawable, nodeIndex: number, groupIndex: number, key: number): DrawCommand => ({
  kind: RenderEntryKind.Draw,
  drawable,
  nodeIndex,
  seq: nodeIndex,
  zIndex: 0,
  material: material(key),
  groupIndex,
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

const makeRegistry = () => ({
  resolve(drawable: Drawable): unknown {
    if (drawable instanceof NonConsumingDrawable) {
      return nonConsumingRenderer;
    }

    return consumingRenderer;
  },
});

interface GroupUploadPlayback {
  readonly storage: WebGpuTransformStorage;
  readonly drawOrder: Drawable[];
  readonly prepareDrawCommandCalls: DrawCommand[];
}

// Mirror the refactored WebGpuBackend group-upload contract: transforms are
// written once per RenderGroup at the upload boundary; _prepareDrawCommand
// only sets the active command without performing any storage writes.
const playGroupUpload = (scope: GroupScope): GroupUploadPlayback => {
  const storage = new WebGpuTransformStorage();
  const drawOrder: Drawable[] = [];
  const prepareDrawCommandCalls: DrawCommand[] = [];

  storage.begin(32);

  const backend = {
    rendererRegistry: makeRegistry(),
    _prepareRenderGroupUpload(entries: readonly ScopeEntry[], startIndex: number, count: number) {
      forEachGroupCommand(entries, startIndex, count, command => {
        if (drawCommandUsesSharedTransform(command, this as unknown as RenderBackend)) {
          storage.writeCommand(command);
        } else {
          storage.recordSkippedWrite();
        }
      });
    },
    _prepareDrawCommand(command: DrawCommand) {
      prepareDrawCommandCalls.push(command);
      // No storage write here — mirrors the refactored backend contract.
    },
    draw(drawable: Drawable) {
      drawOrder.push(drawable);

      return this;
    },
  } as unknown as RenderBackend;

  RenderPlanPlayer.playScope(scope, backend);

  return { storage, drawOrder, prepareDrawCommandCalls };
};

const buildMixedScope = () => {
  const a = new ConsumingDrawable(10, 20, new Color(10, 20, 30, 0.1));
  const b = new ConsumingDrawable(30, 40, new Color(40, 50, 60, 0.2));
  const t1 = new NonConsumingDrawable(55, 65, new Color(70, 80, 90, 0.3));
  const c = new ConsumingDrawable(70, 80, new Color(100, 110, 120, 0.4));
  const t2 = new NonConsumingDrawable(95, 105, new Color(130, 140, 150, 0.5));

  // Two consuming sprites coalesce into one group (same material key);
  // each text node forms its own group (distinct key), matching optimizer behaviour.
  const scope = groupScope([
    drawEntry(createDrawCommand(a, 0, 1, 1)),
    drawEntry(createDrawCommand(b, 1, 1, 1)),
    drawEntry(createDrawCommand(t1, 2, 2, 2)),
    drawEntry(createDrawCommand(c, 3, 3, 3)),
    drawEntry(createDrawCommand(t2, 4, 4, 4)),
  ]);

  return { scope, a, b, c, t1, t2 };
};

describe('WebGPU group-upload: consuming vs non-consuming writes', () => {
  test('writes consuming (Sprite/Mesh-like) commands at group upload boundary', () => {
    const { scope } = buildMixedScope();
    const { storage } = playGroupUpload(scope);

    // Nodes 0, 1 (consuming sprites) and 3 (consuming sprite) are written;
    // nodes 2 and 4 (text-like) are skipped.
    expect(storage.buffer.writeCount).toBe(3);
    expect(storage.buffer.skippedWriteCount).toBe(2);
  });

  test('nodeIndex slots carry the correct world transforms for consuming commands', () => {
    const { scope } = buildMixedScope();
    const { storage } = playGroupUpload(scope);

    // Highest written slot is node 3 → count 4.
    expect(storage.buffer.count).toBe(4);

    const floatsPerSlot = 12;

    // Node 'a' (nodeIndex 0) at position (10, 20).
    expect(storage.buffer.data[4]).toBe(10);
    expect(storage.buffer.data[5]).toBe(20);

    // Node 'c' (nodeIndex 3) at position (70, 80).
    const cOffset = 3 * floatsPerSlot;

    expect(storage.buffer.data[cOffset + 4]).toBe(70);
    expect(storage.buffer.data[cOffset + 5]).toBe(80);

    // Skipped text node at nodeIndex 2 stays fully zeroed —
    // no consuming draw ever references that slot.
    const t1Offset = 2 * floatsPerSlot;

    expect(Array.from(storage.buffer.data.subarray(t1Offset, t1Offset + floatsPerSlot))).toEqual(new Array(floatsPerSlot).fill(0));
  });

  test('a group of only non-consuming commands writes nothing', () => {
    const t1 = new NonConsumingDrawable(10, 20, new Color());
    const t2 = new NonConsumingDrawable(30, 40, new Color());
    const scope = groupScope([drawEntry(createDrawCommand(t1, 0, 1, 1)), drawEntry(createDrawCommand(t2, 1, 1, 1))]);

    const { storage } = playGroupUpload(scope);

    expect(storage.buffer.writeCount).toBe(0);
    expect(storage.buffer.skippedWriteCount).toBe(2);
    expect(storage.buffer.count).toBe(0);
  });

  test('a group of only consuming commands records no skips', () => {
    const a = new ConsumingDrawable(10, 20, new Color());
    const b = new ConsumingDrawable(30, 40, new Color());
    const scope = groupScope([drawEntry(createDrawCommand(a, 0, 1, 1)), drawEntry(createDrawCommand(b, 1, 1, 1))]);

    const { storage } = playGroupUpload(scope);

    expect(storage.buffer.writeCount).toBe(2);
    expect(storage.buffer.skippedWriteCount).toBe(0);
  });
});

describe('WebGPU group-upload: _prepareDrawCommand performs no storage writes', () => {
  test('_prepareDrawCommand is called for every draw but writes no transforms', () => {
    const { scope, a, b, t1, c, t2 } = buildMixedScope();
    const { prepareDrawCommandCalls, storage } = playGroupUpload(scope);

    // The hook fires once per draw regardless of renderer type.
    expect(prepareDrawCommandCalls.map(cmd => cmd.drawable)).toEqual([a, b, t1, c, t2]);

    // All writes originate from _prepareRenderGroupUpload — calling
    // _prepareDrawCommand must not add any extra writes to those counts.
    expect(storage.buffer.writeCount).toBe(3);
    expect(storage.buffer.skippedWriteCount).toBe(2);
  });

  test('write count equals the number of consuming commands, not total draw count', () => {
    const { scope } = buildMixedScope();
    const { storage, prepareDrawCommandCalls } = playGroupUpload(scope);

    const totalDraws = prepareDrawCommandCalls.length;
    const writes = storage.buffer.writeCount;
    const skips = storage.buffer.skippedWriteCount;

    // Writes + skips == total draws; neither counter exceeds the draw count.
    expect(writes + skips).toBe(totalDraws);
    expect(writes).toBeLessThan(totalDraws);
  });
});

describe('WebGPU group-upload: draw order is unchanged', () => {
  test('drawables are submitted in original plan order regardless of renderer type', () => {
    const { scope, a, b, t1, c, t2 } = buildMixedScope();
    const { drawOrder } = playGroupUpload(scope);

    expect(drawOrder).toEqual([a, b, t1, c, t2]);
  });

  test('a scope with only non-consuming draws still submits every drawable', () => {
    const t1 = new NonConsumingDrawable(10, 20, new Color());
    const t2 = new NonConsumingDrawable(30, 40, new Color());
    const t3 = new NonConsumingDrawable(50, 60, new Color());
    const scope = groupScope([drawEntry(createDrawCommand(t1, 0, 1, 1)), drawEntry(createDrawCommand(t2, 1, 1, 1)), drawEntry(createDrawCommand(t3, 2, 1, 1))]);

    const { drawOrder } = playGroupUpload(scope);

    expect(drawOrder).toEqual([t1, t2, t3]);
  });
});

describe('WebGPU group-upload: nodeIndex slot contract', () => {
  test('each command writes to its own stable nodeIndex slot', () => {
    const floatsPerSlot = 12;
    const a = new ConsumingDrawable(11, 22, new Color());
    const b = new ConsumingDrawable(33, 44, new Color());
    const scope = groupScope([drawEntry(createDrawCommand(a, 5, 1, 1)), drawEntry(createDrawCommand(b, 7, 1, 1))]);

    const storage2 = new WebGpuTransformStorage();

    storage2.begin(16);

    const backend = {
      rendererRegistry: makeRegistry(),
      _prepareRenderGroupUpload(entries: readonly ScopeEntry[], startIndex: number, count: number) {
        forEachGroupCommand(entries, startIndex, count, cmd => {
          if (drawCommandUsesSharedTransform(cmd, this as unknown as RenderBackend)) {
            storage2.writeCommand(cmd);
          } else {
            storage2.recordSkippedWrite();
          }
        });
      },
      _prepareDrawCommand() {},
      draw(drawable: Drawable) {
        void drawable;

        return this;
      },
    } as unknown as RenderBackend;

    RenderPlanPlayer.playScope(scope, backend);

    // Node 'a' at nodeIndex 5: tx at offset 5*12+4, ty at 5*12+5.
    expect(storage2.buffer.data[5 * floatsPerSlot + 4]).toBe(11);
    expect(storage2.buffer.data[5 * floatsPerSlot + 5]).toBe(22);

    // Node 'b' at nodeIndex 7: tx at offset 7*12+4, ty at 7*12+5.
    expect(storage2.buffer.data[7 * floatsPerSlot + 4]).toBe(33);
    expect(storage2.buffer.data[7 * floatsPerSlot + 5]).toBe(44);
  });
});

describe('WebGPU group-upload: direct/synthetic push path is unaffected', () => {
  test('push() still allocates a new slot and returns its index', () => {
    const storage = new WebGpuTransformStorage();

    storage.begin(4);

    const d = new ConsumingDrawable(5, 10, new Color(255, 0, 0, 1));
    const slot = storage.push(d);

    expect(typeof slot).toBe('number');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(storage.buffer.count).toBeGreaterThan(0);
  });

  test('push() writes the correct position into the allocated slot', () => {
    const floatsPerSlot = 12;
    const storage = new WebGpuTransformStorage();

    storage.begin(4);

    const d = new ConsumingDrawable(17, 42, new Color());
    const slot = storage.push(d);

    expect(storage.buffer.data[slot * floatsPerSlot + 4]).toBe(17);
    expect(storage.buffer.data[slot * floatsPerSlot + 5]).toBe(42);
  });
});
