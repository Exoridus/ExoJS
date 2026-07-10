import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { MaterialKey } from '#rendering/plan/RenderCommand';
import { RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { type RetainedDrawSlot, RetainedPlanCache } from '#rendering/plan/RetainedPlanCache';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';

const material: MaterialKey = { rendererId: 1, blendMode: 0, textureId: -1, shaderId: -1, pipelineKey: 1, bindKey: 1 };
const fakeBackendA = {} as RenderBackend;
const fakeBackendB = {} as RenderBackend;

const makeSlot = (drawable: Drawable): RetainedDrawSlot => ({
  childIndex: 0,
  drawable,
  seq: 0,
  zIndex: 0,
  material,
  minX: 0,
  minY: 0,
  maxX: 16,
  maxY: 16,
});

describe('RetainedPlanCache', () => {
  test('isClean is false before any capture', () => {
    const cache = new RetainedPlanCache();

    expect(cache.isClean(1, 1, 1, fakeBackendA)).toBe(false);
    expect(cache.slots).toEqual([]);
  });

  test('isClean is true only when content, structure, view, and backend all match the last capture', () => {
    const cache = new RetainedPlanCache();
    const drawable = new Drawable();
    const slots = [makeSlot(drawable)];

    cache.capture(5, 3, 7, fakeBackendA, slots);

    expect(cache.isClean(5, 3, 7, fakeBackendA)).toBe(true);
    expect(cache.slots).toBe(slots);

    expect(cache.isClean(6, 3, 7, fakeBackendA)).toBe(false); // content changed
    expect(cache.isClean(5, 4, 7, fakeBackendA)).toBe(false); // structure changed
    expect(cache.isClean(5, 3, 8, fakeBackendA)).toBe(false); // view moved
    expect(cache.isClean(5, 3, 7, fakeBackendB)).toBe(false); // backend swapped

    drawable.destroy();
  });

  test('invalidate() clears the capture so isClean is false again', () => {
    const cache = new RetainedPlanCache();
    const drawable = new Drawable();

    cache.capture(1, 1, 1, fakeBackendA, [makeSlot(drawable)]);
    cache.invalidate();

    expect(cache.isClean(1, 1, 1, fakeBackendA)).toBe(false);
    expect(cache.slots).toEqual([]);

    drawable.destroy();
  });
});

class ProbeContainer extends Container {
  public probedEntryCount = 0;

  protected override _collectContent(builder: RenderPlanBuilder): void {
    super._collectContent(builder);
    this.probedEntryCount = builder._peekCurrentScopeEntries().length;
  }
}

class ReplayOnlyContainer extends Container {
  public constructor(private readonly slot: RetainedDrawSlot) {
    super();
  }

  protected override _collectContent(builder: RenderPlanBuilder): void {
    builder._replayRetainedDraw(this.slot);
  }
}

const createTestBackend = (): RenderBackend => {
  const renderTarget = new RenderTarget(320, 200, true);

  return {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      return this;
    },
    clear() {
      return this;
    },
    resize() {
      return this;
    },
    setView(v) {
      renderTarget.setView(v);
      return this;
    },
    setRenderTarget() {
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture() {
      throw new Error('not used in this test');
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      renderTarget.destroy();
    },
  } as unknown as RenderBackend;
};

describe('RenderPlanBuilder._peekCurrentScopeEntries / _replayRetainedDraw', () => {
  test('_peekCurrentScopeEntries reflects entries pushed into the currently active scope', () => {
    const backend = createTestBackend();
    const root = new ProbeContainer();

    root.addChild(new Drawable());
    root.addChild(new Drawable());

    const builder = RenderPlanBuilder.acquire();

    builder.build(root, backend);
    RenderPlanBuilder.release(builder);

    expect(root.probedEntryCount).toBe(2);

    root.destroy();
    backend.destroy();
  });

  test("_replayRetainedDraw pushes a Draw entry that reuses the slot's material/bounds and assigns a fresh nodeIndex", () => {
    const backend = createTestBackend();
    const drawable = new Drawable();
    const slot = makeSlot(drawable);
    const root = new ReplayOnlyContainer(slot);

    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(root, backend);

    expect(plan.passes).toHaveLength(1);
    // `root` is a Container, so RenderPlanBuilder.build wraps it in its own
    // Group scope (RenderPlanBuilder.emitNode's non-drawable-node path) — the
    // outer plan root holds one GroupEntry pointing at that scope, and the
    // replayed Draw entry lives inside it.
    const outerEntries = plan.passes[0]!.root.entries;

    expect(outerEntries).toHaveLength(1);
    const outerEntry = outerEntries[0]!;

    expect(outerEntry.kind).toBe(RenderEntryKind.Group);
    if (outerEntry.kind !== RenderEntryKind.Group) {
      throw new Error('unreachable');
    }

    const entries = outerEntry.scope.entries;

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;

    expect(entry.kind).toBe(RenderEntryKind.Draw);
    if (entry.kind === RenderEntryKind.Draw) {
      expect(entry.command.drawable).toBe(drawable);
      expect(entry.command.material).toBe(slot.material); // reused reference, not recomputed
      expect(entry.command.minX).toBe(slot.minX);
      expect(entry.command.maxX).toBe(slot.maxX);
      expect(entry.command.nodeIndex).toBe(0); // fresh frame-local index, not copied from the slot
    }

    RenderPlanBuilder.release(builder);
    drawable.destroy();
    root.destroy();
    backend.destroy();
  });
});
