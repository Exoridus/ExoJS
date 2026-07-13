import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { DrawScopeEntry, GroupScope } from '#rendering/plan/RenderScope';
import { type RetainedFragmentEntry, RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';

const material: MaterialKey = { rendererId: 1, blendMode: 0, textureId: -1, shaderId: -1, pipelineKey: 1, bindKey: 1 };
const fakeBackendA = {} as RenderBackend;
const fakeBackendB = {} as RenderBackend;

// A scope entry as the builder's current scope would hold it — the fragment
// deep-copies it into its own pooled records at capture (Slice 3, F11a).
const makeScopeDrawEntry = (drawable: Drawable, nodeIndex = 0): DrawScopeEntry => ({
  kind: RenderEntryKind.Draw,
  seq: 0,
  zIndex: 0,
  command: {
    kind: RenderEntryKind.Draw,
    drawable,
    nodeIndex,
    seq: 0,
    zIndex: 0,
    material,
    groupIndex: undefined,
    minX: 0,
    minY: 0,
    maxX: 16,
    maxY: 16,
  },
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

    fragment.capture(5, 3, fakeBackendA, [makeScopeDrawEntry(drawable)]);

    expect(fragment.hasCapture).toBe(true);
    expect(fragment.isClean(5, 3, fakeBackendA)).toBe(true);
    expect(fragment.entries).toHaveLength(1);

    const record = fragment.entries[0]!;

    expect(record.kind).toBe(RenderEntryKind.Draw);

    if (record.kind === RenderEntryKind.Draw) {
      expect(record.drawable).toBe(drawable);
      expect(record.material).not.toBe(material); // deep-copied into a pooled key
      expect(record.material).toEqual(material);
      expect(record.maxX).toBe(16);
    }

    expect(fragment.isClean(6, 3, fakeBackendA)).toBe(false); // content changed
    expect(fragment.isClean(5, 4, fakeBackendA)).toBe(false); // structure changed
    expect(fragment.isClean(5, 3, fakeBackendB)).toBe(false); // backend swapped

    drawable.destroy();
  });

  test('captures each top-level draw nodeIndex and looks it up by drawable (Slice 4b row map)', () => {
    const fragment = new RetainedGroupFragment();
    const spriteA = new Drawable();
    const spriteB = new Drawable();

    // Two direct drawable children on shared rows 3 and 5 (a sibling occupied
    // the earlier rows — the group's rows never start at 0).
    fragment.capture(1, 1, fakeBackendA, [makeScopeDrawEntry(spriteA, 3), makeScopeDrawEntry(spriteB, 5)]);

    expect((fragment.entries[0] as { nodeIndex: number }).nodeIndex).toBe(3);
    expect(fragment.directDrawNodeIndex(spriteA)).toBe(3);
    expect(fragment.directDrawNodeIndex(spriteB)).toBe(5);
    expect(fragment.directDrawNodeIndex(new Drawable())).toBeUndefined();

    spriteA.destroy();
    spriteB.destroy();
  });

  test('directDrawNodeIndex rebuilds after a recapture (fresh row assignment)', () => {
    const fragment = new RetainedGroupFragment();
    const sprite = new Drawable();

    fragment.capture(1, 1, fakeBackendA, [makeScopeDrawEntry(sprite, 4)]);
    expect(fragment.directDrawNodeIndex(sprite)).toBe(4);

    fragment.capture(2, 1, fakeBackendA, [makeScopeDrawEntry(sprite, 9)]);
    expect(fragment.directDrawNodeIndex(sprite)).toBe(9);

    sprite.destroy();
  });

  test('dirty-transform-row queue dedups moved nodes and clears (Slice 4b)', () => {
    const fragment = new RetainedGroupFragment();
    const a = new Drawable();
    const b = new Drawable();

    expect(fragment.hasDirtyTransformRows()).toBe(false);

    fragment.enqueueDirtyTransformRow(a);
    fragment.enqueueDirtyTransformRow(a); // same node twice — deduped
    fragment.enqueueDirtyTransformRow(b);

    expect(fragment.hasDirtyTransformRows()).toBe(true);
    expect([...fragment.dirtyTransformRows]).toEqual([a, b]);

    fragment.clearDirtyTransformRows();

    expect(fragment.hasDirtyTransformRows()).toBe(false);

    a.destroy();
    b.destroy();
  });

  test('invalidate() clears the capture', () => {
    const fragment = new RetainedGroupFragment();
    const drawable = new Drawable();

    fragment.capture(1, 1, fakeBackendA, [makeScopeDrawEntry(drawable)]);
    fragment.invalidate();

    expect(fragment.hasCapture).toBe(false);
    expect(fragment.isClean(1, 1, fakeBackendA)).toBe(false);
    expect(fragment.entries).toEqual([]);

    drawable.destroy();
  });

  test('_devHasDestroyedDrawable reports a destroyed captured drawable (P3f)', () => {
    const fragment = new RetainedGroupFragment();
    const drawable = new Drawable();

    fragment.capture(1, 1, fakeBackendA, [makeScopeDrawEntry(drawable)]);

    expect(fragment._devHasDestroyedDrawable()).toBe(false);

    drawable.destroy();

    expect(fragment._devHasDestroyedDrawable()).toBe(true);
  });

  test('invalidate() releases the pooled strong reference to drawables so they can GC (P3f)', () => {
    const fragment = new RetainedGroupFragment();
    const drawable = new Drawable();

    fragment.capture(1, 1, fakeBackendA, [makeScopeDrawEntry(drawable)]);
    drawable.destroy();

    // Before the fix the grow-only draw pool still pins the destroyed drawable
    // even after the entries array is emptied.
    fragment.invalidate();

    expect(fragment._devHasDestroyedDrawable()).toBe(false);
    expect(fragment.entries).toEqual([]);
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
  // Snapshotting is fragment-owned since Slice 3 (F11a): the probe captures
  // its scope entries into a fragment exactly like RetainedContainer does.
  public readonly probeFragment = new RetainedGroupFragment();
  public lastSnapshot: readonly RetainedFragmentEntry[] | null = null;

  protected override _collectContent(builder: RenderPlanBuilder): void {
    super._collectContent(builder);
    this.probeFragment.capture(0, 0, builder.backend, builder._peekCurrentScopeEntries());
    this.lastSnapshot = this.probeFragment.entries;
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
