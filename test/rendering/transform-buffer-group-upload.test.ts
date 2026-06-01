import { Color } from '@/core/Color';
import { Drawable } from '@/rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '@/rendering/plan/RenderCommand';
import type { RenderGroup } from '@/rendering/plan/RenderInstruction';
import { RenderPlanPlayer } from '@/rendering/plan/RenderPlanPlayer';
import type { DrawScopeEntry, GroupScope, GroupScopeEntry } from '@/rendering/plan/RenderScope';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { TransformBuffer } from '@/rendering/TransformBuffer';

const floatsPerSlot = 12;

class BoxDrawable extends Drawable {
  public constructor(
    public readonly id: string,
    x: number,
    y: number,
    tint: Color,
  ) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

const material = (id: number): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: id,
  bindKey: id,
});

const createDrawCommand = (drawable: Drawable, seq: number, groupIndex: number | undefined, key: number): DrawCommand => ({
  kind: RenderEntryKind.Draw,
  drawable,
  nodeIndex: seq,
  seq,
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

const groupEntry = (scope: GroupScope, seq: number): GroupScopeEntry => ({
  kind: RenderEntryKind.Group,
  seq,
  zIndex: 0,
  scope,
});

const groupScope = (entries: (DrawScopeEntry | GroupScopeEntry)[]): GroupScope => ({
  kind: RenderEntryKind.Group,
  entries,
  hasMixedZ: false,
  preserveDrawOrder: false,
});

// Reference packing: one write per draw — the pre-refactor `_prepareDrawCommand` path.
const packPerDraw = (scope: GroupScope): TransformBuffer => {
  const buffer = new TransformBuffer();

  buffer.begin();

  const backend = {
    _prepareDrawCommand(command: DrawCommand) {
      buffer.write(command.nodeIndex, command.drawable.getGlobalTransform(), command.drawable.tint);
    },
    draw() {
      return this;
    },
  } as unknown as RenderBackend;

  RenderPlanPlayer.playScope(scope, backend);

  return buffer;
};

// Refactored packing: one contiguous slice per render-group upload boundary,
// with `_prepareDrawCommand` reduced to a pure active-draw setter (no write).
const packPerGroupUpload = (scope: GroupScope): TransformBuffer => {
  const buffer = new TransformBuffer();

  buffer.begin();

  const backend = {
    _prepareRenderGroupUpload(group: RenderGroup) {
      for (const command of group.instructions) {
        buffer.write(command.nodeIndex, command.drawable.getGlobalTransform(), command.drawable.tint);
      }
    },
    _prepareDrawCommand() {
      // Mirrors the refactored backend contract: no transform write here.
    },
    draw() {
      return this;
    },
  } as unknown as RenderBackend;

  RenderPlanPlayer.playScope(scope, backend);

  return buffer;
};

const sliceData = (buffer: TransformBuffer): number[] => Array.from(buffer.data.subarray(0, buffer.count * floatsPerSlot));

// Distinct transform + tint per node so any divergence in packed contents is observable.
const buildNestedScope = (): GroupScope => {
  const a = new BoxDrawable('a', 10, 20, new Color(10, 20, 30, 0.1));
  const b = new BoxDrawable('b', 30, 40, new Color(40, 50, 60, 0.2));
  const c = new BoxDrawable('c', 50, 60, new Color(70, 80, 90, 0.3));
  const d = new BoxDrawable('d', 70, 80, new Color(100, 110, 120, 0.4));
  const e = new BoxDrawable('e', 90, 100, new Color(130, 140, 150, 0.5));
  const u = new BoxDrawable('u', 110, 120, new Color(160, 170, 180, 0.6));
  const v = new BoxDrawable('v', 130, 140, new Color(190, 200, 210, 0.7));
  const nested = groupScope([drawEntry(createDrawCommand(d, 3, 7, 7)), drawEntry(createDrawCommand(e, 4, 7, 7))]);

  return groupScope([
    drawEntry(createDrawCommand(a, 0, 1, 1)),
    drawEntry(createDrawCommand(b, 1, 1, 1)),
    groupEntry(nested, 2),
    drawEntry(createDrawCommand(c, 5, 1, 1)),
    drawEntry(createDrawCommand(u, 6, undefined, 1)),
    drawEntry(createDrawCommand(v, 7, undefined, 1)),
  ]);
};

describe('transform buffer render-group upload wiring', () => {
  test('render-group upload packing reproduces per-draw packing across nested scopes', () => {
    const reference = packPerDraw(buildNestedScope());
    const upload = packPerGroupUpload(buildNestedScope());

    expect(upload.count).toBe(reference.count);
    expect(sliceData(upload)).toEqual(sliceData(reference));
  });

  test('each draw nodeIndex slot carries its own world transform and tint', () => {
    const buffer = packPerGroupUpload(buildNestedScope());

    // nodeIndex == seq; slot 2 is never emitted (the nested group occupies it),
    // so the buffer count reaches the highest written slot (v at nodeIndex 7).
    expect(buffer.count).toBe(8);

    // Node 'a' (nodeIndex 0) at position (10, 20), tint rgba(10, 20, 30, 0.1).
    expect(buffer.data[0]).toBe(1); // a
    expect(buffer.data[3]).toBe(1); // d
    expect(buffer.data[4]).toBe(10); // tx
    expect(buffer.data[5]).toBe(20); // ty
    expect(buffer.data[8]).toBeCloseTo(10 / 255, 6);
    expect(buffer.data[11]).toBeCloseTo(0.1, 6);

    // Node 'd' lives inside the nested group at nodeIndex 3, position (70, 80).
    const dOffset = 3 * floatsPerSlot;

    expect(buffer.data[dOffset + 4]).toBe(70);
    expect(buffer.data[dOffset + 5]).toBe(80);

    // The unwritten slot 2 stays zeroed.
    expect(Array.from(buffer.data.subarray(2 * floatsPerSlot, 3 * floatsPerSlot))).toEqual(new Array(floatsPerSlot).fill(0));
  });

  test('repeated playback packs identical contents', () => {
    const scope = buildNestedScope();
    const first = packPerGroupUpload(scope);
    const second = packPerGroupUpload(scope);

    expect(second.count).toBe(first.count);
    expect(sliceData(second)).toEqual(sliceData(first));
  });
});
