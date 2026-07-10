import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import { type RetainedFragmentEntry, RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';

const material: MaterialKey = { rendererId: 1, blendMode: 0, textureId: -1, shaderId: -1, pipelineKey: 1, bindKey: 1 };
const fakeBackendA = {} as RenderBackend;
const fakeBackendB = {} as RenderBackend;

const makeDrawEntry = (drawable: Drawable): RetainedFragmentEntry => ({
  kind: RenderEntryKind.Draw,
  drawable,
  seq: 0,
  zIndex: 0,
  material,
  minX: 0,
  minY: 0,
  maxX: 16,
  maxY: 16,
});

describe('RetainedGroupFragment', () => {
  test('isClean is false before any capture; hasCapture reflects lifecycle', () => {
    const fragment = new RetainedGroupFragment();

    expect(fragment.hasCapture).toBe(false);
    expect(fragment.isClean(1, 1, fakeBackendA)).toBe(false);
    expect(fragment.entries).toEqual([]);
  });

  test('isClean requires content, structure and backend to match — and nothing else (no view key)', () => {
    const fragment = new RetainedGroupFragment();
    const drawable = new Drawable();
    const entries = [makeDrawEntry(drawable)];

    fragment.capture(5, 3, fakeBackendA, entries);

    expect(fragment.hasCapture).toBe(true);
    expect(fragment.isClean(5, 3, fakeBackendA)).toBe(true);
    expect(fragment.entries).toBe(entries);

    expect(fragment.isClean(6, 3, fakeBackendA)).toBe(false); // content changed
    expect(fragment.isClean(5, 4, fakeBackendA)).toBe(false); // structure changed
    expect(fragment.isClean(5, 3, fakeBackendB)).toBe(false); // backend swapped

    drawable.destroy();
  });

  test('invalidate() clears the capture', () => {
    const fragment = new RetainedGroupFragment();
    const drawable = new Drawable();

    fragment.capture(1, 1, fakeBackendA, [makeDrawEntry(drawable)]);
    fragment.invalidate();

    expect(fragment.hasCapture).toBe(false);
    expect(fragment.isClean(1, 1, fakeBackendA)).toBe(false);
    expect(fragment.entries).toEqual([]);

    drawable.destroy();
  });
});

// File-local fake backend (repo convention keeps test harnesses file-local
// rather than importing them across test files) — duplicated verbatim from
// test/rendering/retained-subtree-skip.test.ts.
const createTestBackend = (): RenderBackend => {
  const renderTarget = new RenderTarget(800, 600, true);

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

// `build()` wraps a Container root in its own Group scope, so the draws for a
// scene never live at `pass.root.entries` — they are nested one or more
// Group/Barrier scopes deep. Walk the scope tree in entry order to recover the
// true post-optimize paint order.
const gatherScopeDraws = (scope: GroupScope, out: DrawCommand[]): void => {
  for (const entry of scope.entries) {
    if (entry.kind === RenderEntryKind.Draw) {
      out.push(entry.command);
    } else if (entry.kind === RenderEntryKind.Group) {
      gatherScopeDraws(entry.scope, out);
    } else if (entry.kind === RenderEntryKind.Barrier && entry.scope.childPlan !== null) {
      gatherScopeDraws(entry.scope.childPlan, out);
    }
  }
};

// Every collected Container (not just the pass root) wraps its own direct
// children in a fresh GroupScope (RenderPlanBuilder.emitNode's group branch),
// so a boundary nested under a plain ancestor lives one scope deeper than a
// shallow `entries.find` on the outer scope would reach (same "nested one or
// more Group scopes deep" convention `gatherScopeDraws` above documents).
// Locate the scope that directly owns the draw entry for `drawableId`.
const findScopeOwningDraw = (scope: GroupScope, drawableId: string): GroupScope | null => {
  for (const entry of scope.entries) {
    if (entry.kind === RenderEntryKind.Draw && (entry.command.drawable as LeafDrawable).id === drawableId) {
      return scope;
    }

    if (entry.kind === RenderEntryKind.Group) {
      const found = findScopeOwningDraw(entry.scope, drawableId);

      if (found !== null) {
        return found;
      }
    }
  }

  return null;
};

const collectDraws = (root: Container, backend: RenderBackend): DrawCommand[] => {
  const builder = RenderPlanBuilder.acquire();
  const plan = builder.build(root, backend);

  RenderPlanOptimizer.optimize(plan);

  const draws: DrawCommand[] = [];
  for (const pass of plan.passes) {
    gatherScopeDraws(pass.root, draws);
  }

  RenderPlanBuilder.release(builder);

  return draws;
};

const snapshot = (draws: readonly DrawCommand[]) =>
  draws.map(d => ({
    id: (d.drawable as LeafDrawable).id,
    seq: d.seq,
    zIndex: d.zIndex,
    material: { ...d.material },
    minX: d.minX,
    minY: d.minY,
    maxX: d.maxX,
    maxY: d.maxY,
  }));

class BoundaryContainer extends Container {
  public override get _isTransformGroupBoundary(): boolean {
    return true;
  }
}

class LeafDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

class SnapshotProbeContainer extends BoundaryContainer {
  public lastSnapshot: RetainedFragmentEntry[] | null = null;

  protected override _collectContent(builder: RenderPlanBuilder): void {
    super._collectContent(builder);
    this.lastSnapshot = builder._snapshotScopeEntries(builder._peekCurrentScopeEntries());
  }
}

class ReplayFragmentContainer extends BoundaryContainer {
  public constructor(private readonly _entries: readonly RetainedFragmentEntry[]) {
    super();
  }

  protected override _collectContent(builder: RenderPlanBuilder): void {
    builder._replayRetainedFragment(this._entries);
  }
}

describe('builder: transformNode marking, cull suppression, snapshot/replay round-trip', () => {
  test('emitNode marks a boundary container scope with transformNode', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new BoundaryContainer();

    group.addChild(new LeafDrawable('a'));
    root.addChild(group);

    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(root, backend);
    // `group`'s own scope (holding its direct child, the 'a' draw) is nested
    // below root's own wrapping scope — see findScopeOwningDraw.
    const groupScope = findScopeOwningDraw(plan.passes[0]!.root, 'a');

    expect(groupScope).not.toBeNull();
    expect(groupScope!.transformNode).toBe(group);

    // A PLAIN container scope stays unmarked.
    const plainRoot = new Container();
    const plain = new Container();

    plain.addChild(new LeafDrawable('b'));
    plainRoot.addChild(plain);

    const plainPlan = builder.build(plainRoot, backend);
    const plainScope = findScopeOwningDraw(plainPlan.passes[0]!.root, 'b');

    expect(plainScope).not.toBeNull();
    expect(plainScope!.transformNode).toBeNull();

    RenderPlanBuilder.release(builder);
    root.destroy();
    plainRoot.destroy();
    backend.destroy();
  });

  test('inside a boundary container, per-child view culling is suppressed', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new BoundaryContainer();
    const farLeaf = new LeafDrawable('far');

    // Group-relative position far outside the 800x600 view: without
    // suppression this child would be culled against a space it is not in.
    farLeaf.setPosition(5000, 5000);
    group.addChild(farLeaf);
    root.addChild(group);

    const draws = collectDraws(root, backend);

    expect(draws.map(d => (d.drawable as LeafDrawable).id)).toEqual(['far']);

    root.destroy();
    backend.destroy();
  });

  test('snapshot -> replay reproduces the identical draw data with fresh nodeIndex', () => {
    const backend = createTestBackend();
    const probeRoot = new Container();
    const probe = new SnapshotProbeContainer();
    const mid = new Container();

    mid.addChild(new LeafDrawable('a'));
    mid.addChild(new LeafDrawable('b'));
    probe.addChild(mid);
    probe.addChild(new LeafDrawable('c'));
    probeRoot.addChild(probe);

    const originalDraws = snapshot(collectDraws(probeRoot, backend));

    expect(probe.lastSnapshot).not.toBeNull();

    const replayRoot = new Container();
    const replay = new ReplayFragmentContainer(probe.lastSnapshot!);

    replayRoot.addChild(replay);

    const replayedRaw = collectDraws(replayRoot, backend);
    const replayed = snapshot(replayedRaw);

    expect(replayed).toEqual(originalDraws);
    // Fresh frame-local node indices, not stale captured ones.
    expect(replayedRaw.map(d => d.nodeIndex)).toEqual(replayedRaw.map((_, i) => i));

    probeRoot.destroy();
    replayRoot.destroy();
    backend.destroy();
  });
});
