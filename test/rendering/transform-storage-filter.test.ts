import { Color } from '@/core/Color';
import { Drawable } from '@/rendering/Drawable';
import { type DrawCommand, drawCommandUsesSharedTransform, type MaterialKey, RenderEntryKind } from '@/rendering/plan/RenderCommand';
import type { RenderGroup } from '@/rendering/plan/RenderInstruction';
import { RenderPlanPlayer } from '@/rendering/plan/RenderPlanPlayer';
import type { DrawScopeEntry, GroupScope } from '@/rendering/plan/RenderScope';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { TransformBuffer } from '@/rendering/TransformBuffer';

const floatsPerSlot = 12;

// A drawable whose renderer reads the shared transform storage (Sprite/Mesh-like).
class ConsumingDrawable extends Drawable {
  public constructor(x: number, y: number, tint: Color) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

// A drawable whose renderer packs its own per-node data (Text/Particle-like).
class NonConsumingDrawable extends Drawable {
  public constructor(x: number, y: number, tint: Color) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

// Renderer stubs mirroring the real capability flags: consuming renderers carry
// no flag (default consume), non-consuming renderers opt out with `false`.
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

// Resolve by constructor identity, like the real RendererRegistry does for the
// drawable types registered up front.
const makeRegistry = () => ({
  resolve(drawable: Drawable): unknown {
    if (drawable instanceof NonConsumingDrawable) {
      return nonConsumingRenderer;
    }

    return consumingRenderer;
  },
});

interface FilteredPlayback {
  readonly buffer: TransformBuffer;
  readonly drawOrder: Drawable[];
  readonly writtenNodeIndices: number[];
}

// Faithful reproduction of the WebGL2 backend's render-group upload boundary
// with the shared-transform filter applied, routed through the production
// `drawCommandUsesSharedTransform` predicate.
const playFiltered = (scope: GroupScope): FilteredPlayback => {
  const buffer = new TransformBuffer();
  const drawOrder: Drawable[] = [];
  const writtenNodeIndices: number[] = [];

  buffer.begin();

  const backend = {
    rendererRegistry: makeRegistry(),
    _prepareRenderGroupUpload(group: RenderGroup) {
      for (const command of group.instructions) {
        if (drawCommandUsesSharedTransform(command, this as unknown as RenderBackend)) {
          buffer.write(command.nodeIndex, command.drawable.getGlobalTransform(), command.drawable.tint);
          writtenNodeIndices.push(command.nodeIndex);
        }
      }
    },
    _prepareDrawCommand() {
      // Mirrors the refactored backend contract: no transform write here.
    },
    draw(drawable: Drawable) {
      drawOrder.push(drawable);

      return this;
    },
  } as unknown as RenderBackend;

  RenderPlanPlayer.playScope(scope, backend);

  return { buffer, drawOrder, writtenNodeIndices };
};

const buildMixedScope = () => {
  const a = new ConsumingDrawable(10, 20, new Color(10, 20, 30, 0.1));
  const b = new ConsumingDrawable(30, 40, new Color(40, 50, 60, 0.2));
  const t1 = new NonConsumingDrawable(55, 65, new Color(70, 80, 90, 0.3));
  const c = new ConsumingDrawable(70, 80, new Color(100, 110, 120, 0.4));
  const t2 = new NonConsumingDrawable(95, 105, new Color(130, 140, 150, 0.5));

  // Two consuming sprites coalesce into one group; each text node forms its own
  // group (distinct material), matching how the optimizer separates renderers.
  const scope = groupScope([
    drawEntry(createDrawCommand(a, 0, 1, 1)),
    drawEntry(createDrawCommand(b, 1, 1, 1)),
    drawEntry(createDrawCommand(t1, 2, 2, 2)),
    drawEntry(createDrawCommand(c, 3, 3, 3)),
    drawEntry(createDrawCommand(t2, 4, 4, 4)),
  ]);

  return { scope, a, b, c, t1, t2 };
};

describe('drawCommandUsesSharedTransform', () => {
  const command = createDrawCommand(new ConsumingDrawable(0, 0, new Color()), 0, 1, 1);

  test('writes for renderers without an opt-out flag (Sprite/Mesh default)', () => {
    const backend = { rendererRegistry: { resolve: () => ({}) } } as unknown as RenderBackend;

    expect(drawCommandUsesSharedTransform(command, backend)).toBe(true);
  });

  test('writes for renderers that explicitly consume the shared transform', () => {
    const backend = { rendererRegistry: { resolve: () => ({ _consumesSharedTransform: true }) } } as unknown as RenderBackend;

    expect(drawCommandUsesSharedTransform(command, backend)).toBe(true);
  });

  test('skips renderers that opt out via _consumesSharedTransform === false', () => {
    const backend = { rendererRegistry: { resolve: () => ({ _consumesSharedTransform: false }) } } as unknown as RenderBackend;

    expect(drawCommandUsesSharedTransform(command, backend)).toBe(false);
  });

  test('defaults to writing when no renderer is registered (resolve throws)', () => {
    const backend = {
      rendererRegistry: {
        resolve: () => {
          throw new Error('no renderer');
        },
      },
    } as unknown as RenderBackend;

    expect(drawCommandUsesSharedTransform(command, backend)).toBe(true);
  });

  test('defaults to writing when the backend exposes no renderer registry', () => {
    const backend = {} as unknown as RenderBackend;

    expect(drawCommandUsesSharedTransform(command, backend)).toBe(true);
  });
});

describe('render-group upload skips non-consuming transform writes', () => {
  test('writes Sprite/Mesh-like commands and skips Text/Particle-like commands', () => {
    const { scope } = buildMixedScope();
    const { writtenNodeIndices } = playFiltered(scope);

    // Only the consuming nodes (0, 1, 3) are packed; the text nodes (2, 4) are skipped.
    expect(writtenNodeIndices).toEqual([0, 1, 3]);
  });

  test('buffer count reflects only consuming commands and skipped slots stay zeroed', () => {
    const { scope } = buildMixedScope();
    const { buffer } = playFiltered(scope);

    // Highest written slot is the consuming node at nodeIndex 3 → count 4.
    expect(buffer.count).toBe(4);

    // Consuming node 'a' (nodeIndex 0) at (10, 20).
    expect(buffer.data[4]).toBe(10);
    expect(buffer.data[5]).toBe(20);

    // Consuming node 'c' (nodeIndex 3) at (70, 80).
    const cOffset = 3 * floatsPerSlot;
    expect(buffer.data[cOffset + 4]).toBe(70);
    expect(buffer.data[cOffset + 5]).toBe(80);

    // Skipped text node at nodeIndex 2 (within range) stays fully zeroed —
    // no consuming draw references it, so the transform is never read.
    const t1Offset = 2 * floatsPerSlot;
    expect(Array.from(buffer.data.subarray(t1Offset, t1Offset + floatsPerSlot))).toEqual(new Array(floatsPerSlot).fill(0));
  });

  test('draw submit order is unchanged by the filter', () => {
    const { scope, a, b, c, t1, t2 } = buildMixedScope();
    const { drawOrder } = playFiltered(scope);

    expect(drawOrder).toEqual([a, b, t1, c, t2]);
  });

  test('a group made entirely of non-consuming draws writes nothing', () => {
    const t1 = new NonConsumingDrawable(10, 20, new Color());
    const t2 = new NonConsumingDrawable(30, 40, new Color());
    const scope = groupScope([drawEntry(createDrawCommand(t1, 0, 1, 1)), drawEntry(createDrawCommand(t2, 1, 1, 1))]);

    const { buffer, writtenNodeIndices, drawOrder } = playFiltered(scope);

    expect(writtenNodeIndices).toEqual([]);
    expect(buffer.count).toBe(0);
    expect(drawOrder).toEqual([t1, t2]);
  });
});
