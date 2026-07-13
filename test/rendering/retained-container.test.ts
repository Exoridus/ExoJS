import { Color } from '#core/Color';
import { logger } from '#core/logging';
import type { Stage } from '#core/Stage';
import type { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { GroupScope, GroupScopeEntry } from '#rendering/plan/RenderScope';
import { type RetainedFragmentEntry, RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';

class LeafDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as { _fragment: RetainedGroupFragment })._fragment;

describe('RetainedContainer: Slice 4b transform-row seam', () => {
  test('a direct child move enqueues that node on the group fragment', () => {
    const group = new RetainedContainer();
    const child = new LeafDrawable('a');

    group.addChild(child);
    fragmentOf(group).clearDirtyTransformRows(); // drop the add-time churn

    child.setPosition(40, 40);

    expect([...fragmentOf(group).dirtyTransformRows]).toEqual([child]);

    group.destroy();
  });

  test('a move nested below a plain sub-container still enqueues on the enclosing group', () => {
    const group = new RetainedContainer();
    const inner = new Container();
    const child = new LeafDrawable('deep');

    inner.addChild(child);
    group.addChild(inner);
    fragmentOf(group).clearDirtyTransformRows();

    child.setPosition(5, 5);

    expect(fragmentOf(group).dirtyTransformRows.includes(child)).toBe(true);

    group.destroy();
  });

  test("the group's OWN move does not enqueue a row (it is a one-matrix group move)", () => {
    const group = new RetainedContainer();
    const child = new LeafDrawable('a');

    group.addChild(child);
    fragmentOf(group).clearDirtyTransformRows();

    group.setPosition(100, 100);

    expect(fragmentOf(group).hasDirtyTransformRows()).toBe(false);

    group.destroy();
  });

  test('moving a node outside any group is a no-op (no enclosing boundary)', () => {
    const root = new Container();
    const child = new LeafDrawable('free');

    root.addChild(child);

    expect(() => child.setPosition(3, 3)).not.toThrow();

    root.destroy();
  });

  test('the move seam re-arms across a group destroy (boundary-count balance)', () => {
    // With no live boundary the seam short-circuits; a child under a group must
    // still enqueue after another group elsewhere has been destroyed (the global
    // count must balance construct/destroy exactly, never leaving it stuck at 0).
    const throwaway = new RetainedContainer();

    throwaway.destroy();

    const group = new RetainedContainer();
    const child = new LeafDrawable('a');

    group.addChild(child);
    fragmentOf(group).clearDirtyTransformRows();

    child.setPosition(7, 7);

    expect(fragmentOf(group).dirtyTransformRows.includes(child)).toBe(true);

    group.destroy();
  });
});

// File-local fake backend (repo convention keeps test harnesses file-local
// rather than importing them across test files).
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

// `build()` wraps a Container root in its own Group scope (see
// retained-plan-cache.test.ts), so the draws for a scene never live at
// `pass.root.entries` — they are nested one or more Group/Barrier scopes deep.
// Walk the scope tree in entry order to recover the true post-optimize paint
// order.
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

// `build()` always wraps its `root` argument in one Group entry of its own
// (see `RenderPlanBuilder.build`: `root._collect(this)` runs through the same
// `emitNode` path as any other node), so a node's OWN Group entry is never a
// direct child of `plan.passes[0].root.entries` unless that node was itself
// passed as `build()`'s root — it is nested one or more Group/Barrier scopes
// deep. Search the whole scope tree for the entry whose `transformNode` is
// the exact node under test (stronger than an unqualified "first Group entry"
// find, and correct regardless of nesting depth).
const findGroupEntryFor = (scope: GroupScope, node: Container): GroupScopeEntry | undefined => {
  for (const entry of scope.entries) {
    if (entry.kind === RenderEntryKind.Group) {
      if (entry.scope.transformNode === node) {
        return entry;
      }

      const nested = findGroupEntryFor(entry.scope, node);

      if (nested !== undefined) {
        return nested;
      }
    } else if (entry.kind === RenderEntryKind.Barrier && entry.scope.childPlan !== null) {
      const nested = findGroupEntryFor(entry.scope.childPlan, node);

      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
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

describe('RetainedContainer: revision decoupling (spec 4.3)', () => {
  test('moving the container bumps the group-matrix version, NOT its content revision', () => {
    const group = new RetainedContainer();

    group.addChild(new Drawable());

    const contentBefore = group._contentRevision;
    const versionBefore = group._groupMatrixVersion;

    group.setPosition(100, 50);
    group.setRotation(15);
    group.setScale(2);

    expect(group._groupMatrixVersion).toBeGreaterThan(versionBefore);
    expect(group._contentRevision).toBe(contentBefore);

    group.destroy();
  });

  test('moving the container does not content-dirty its ancestors either', () => {
    const root = new Container();
    const group = new RetainedContainer();

    root.addChild(group);

    const rootBefore = root._contentRevision;

    group.setPosition(10, 10);

    expect(root._contentRevision).toBe(rootBefore);

    root.destroy();
  });

  test('a CONTENT mutation INSIDE the subtree still content-dirties the container (D7 propagation)', () => {
    const group = new RetainedContainer();
    const leaf = new Drawable();

    group.addChild(leaf);

    const before = group._contentRevision;

    // Slice 4b: a transform move no longer content-dirties the group (it patches
    // the row); a genuine content change (tint) still propagates content up.
    leaf.setTint(new Color(9, 9, 9));

    expect(group._contentRevision).toBeGreaterThan(before);

    group.destroy();
  });

  test('a transform-only mutation INSIDE the subtree does NOT content-dirty the container (Slice 4b flip)', () => {
    const group = new RetainedContainer();
    const leaf = new Drawable();

    group.addChild(leaf);

    const contentBefore = group._contentRevision;
    const transformBefore = group._transformRevision;

    leaf.setPosition(3, 3);

    expect(group._contentRevision).toBe(contentBefore);
    expect(group._transformRevision).toBeGreaterThan(transformBefore);

    group.destroy();
  });

  test('structural mutations on the container itself still structure-dirty it', () => {
    const group = new RetainedContainer();
    const before = group._structureRevision;

    group.addChild(new Drawable());

    expect(group._structureRevision).toBeGreaterThan(before);

    group.destroy();
  });
});

describe('RetainedContainer: group bounds and group-level culling (spec 6)', () => {
  test('getBounds() lifts group-local child bounds into world space', () => {
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a'); // local bounds 0..16

    group.addChild(leaf);
    group.setPosition(100, 200);

    const bounds = group.getBounds();

    expect(bounds.left).toBe(100);
    expect(bounds.top).toBe(200);
    expect(bounds.right).toBe(116);
    expect(bounds.bottom).toBe(216);

    group.destroy();
  });

  test('a group fully outside the view is culled as a whole; panning the view brings it back', () => {
    const backend = createTestBackend(); // 800x600 view
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new LeafDrawable('a'));
    group.setPosition(2000, 2000);
    root.addChild(group);

    expect(collectDraws(root, backend)).toHaveLength(0);

    backend.view.setCenter(2000, 2000);

    expect(collectDraws(root, backend)).toHaveLength(1);

    root.destroy();
    backend.destroy();
  });

  test('output equivalence at identity: a RetainedContainer collects the same draw data as a plain Container', () => {
    const backend = createTestBackend();

    const buildScene = (group: Container): Container => {
      const root = new Container();
      const mid = new Container();

      mid.addChild(new LeafDrawable('a'));
      mid.addChild(new LeafDrawable('b'));
      group.addChild(mid);
      group.addChild(new LeafDrawable('c'));
      root.addChild(group);

      return root;
    };

    const plainRoot = buildScene(new Container());
    const retainedRoot = buildScene(new RetainedContainer());

    // At identity the group-local space IS world space, so the collected
    // draw data must be byte-identical (the documented space convention
    // makes them differ only under a non-identity group transform).
    expect(snapshot(collectDraws(retainedRoot, backend))).toEqual(snapshot(collectDraws(plainRoot, backend)));

    plainRoot.destroy();
    retainedRoot.destroy();
    backend.destroy();
  });

  test('under a group translation, captured bounds stay group-local (the space convention)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    leaf.setPosition(5, 5);
    group.setPosition(100, 100);
    group.addChild(leaf);
    root.addChild(group);

    const draws = collectDraws(root, backend);

    expect(draws).toHaveLength(1);
    // Group-local: the leaf's own 5..21, NOT 105..121.
    expect(draws[0]!.minX).toBe(5);
    expect(draws[0]!.minY).toBe(5);

    root.destroy();
    backend.destroy();
  });

  test('per-child view culling is suppressed inside an engaged group; the identical plain Container scene DOES cull that child', () => {
    const backend = createTestBackend(); // 800x600 view

    const buildScene = (group: Container): { root: Container; far: LeafDrawable } => {
      const root = new Container();
      const near = new LeafDrawable('near'); // group-local origin -> on-screen
      const far = new LeafDrawable('far');

      far.setPosition(-5000, 0); // far outside the view rect in EITHER space
      group.setPosition(100, 100); // group's world AABB still intersects the view via `near`
      group.addChild(near);
      group.addChild(far);
      root.addChild(group);

      return { root, far };
    };

    // Plain Container: normal per-child culling drops the far child.
    const plain = buildScene(new Container());
    const plainDraws = collectDraws(plain.root, backend);

    expect(plainDraws.some(d => d.drawable === plain.far)).toBe(false);

    // Engaged RetainedContainer: the group is culled as a whole (its AABB is
    // in view), and per-child culling inside the boundary is suppressed, so
    // the far child's draw command must be collected. Its group-local bounds
    // are meaningless against the world-space view rect (spec 6) -- culling
    // it per-child here would be wrong, not just slow.
    const retained = buildScene(new RetainedContainer());
    const retainedDraws = collectDraws(retained.root, backend);

    expect(retainedDraws.some(d => d.drawable === retained.far)).toBe(true);

    plain.root.destroy();
    retained.root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: deep-barrier escape output equivalence (plan D-P4 spec 8, scoped per F13/R3)', () => {
  test('the escaped branch renders byte-identical to the same branch in a plain Container scene (world space)', () => {
    const backend = createTestBackend();

    const buildScene = (groupNode: Container): Container => {
      const sceneRoot = new Container();
      const midNode = new Container();
      const deep = new LeafDrawable('deep');

      deep.clip = true;
      deep.clipShape = new Rectangle(0, 0, 8, 8);
      midNode.setPosition(10, 0);
      midNode.addChild(deep);
      groupNode.setPosition(40, 0);
      groupNode.addChild(midNode);
      sceneRoot.addChild(groupNode);

      return sceneRoot;
    };

    const plainRoot = buildScene(new Container());
    const retainedRoot = buildScene(new RetainedContainer());

    // The branch containing the deep barrier escapes the group, so it
    // collects the exact plain-Container plan for that branch: same world
    // bounds, same material keys, same order.
    expect(snapshot(collectDraws(retainedRoot, backend))).toEqual(snapshot(collectDraws(plainRoot, backend)));

    plainRoot.destroy();
    retainedRoot.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: whole-range fragment splice (spec 4.2)', () => {
  test('a clean second frame replays without getBounds()/material-key work for any descendant', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    mid.addChild(leafA);
    group.addChild(mid);
    group.addChild(leafB);
    root.addChild(group);

    collectDraws(root, backend); // frame 1: full collect + capture

    const boundsSpyA = vi.spyOn(leafA, 'getBounds');
    const boundsSpyB = vi.spyOn(leafB, 'getBounds');
    const materialSpyA = vi.spyOn(leafA, '_getOrComputeMaterialKey');
    const materialSpyB = vi.spyOn(leafB, '_getOrComputeMaterialKey');
    const collectSpy = vi.spyOn(mid, '_collect');

    const frame2 = snapshot(collectDraws(root, backend)); // frame 2: splice

    expect(boundsSpyA).not.toHaveBeenCalled();
    expect(boundsSpyB).not.toHaveBeenCalled();
    expect(materialSpyA).not.toHaveBeenCalled();
    expect(materialSpyB).not.toHaveBeenCalled();
    expect(collectSpy).not.toHaveBeenCalled(); // no scene-graph walk at all

    expect(frame2.map(d => d.id)).toEqual(['a', 'b']);

    root.destroy();
    backend.destroy();
  });

  test('output equivalence: spliced frame equals the full-collect frame byte for byte', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();

    mid.addChild(new LeafDrawable('a'));
    mid.addChild(new LeafDrawable('b'));
    group.addChild(mid);
    group.addChild(new LeafDrawable('c'));
    root.addChild(group);

    const frame1 = snapshot(collectDraws(root, backend));
    const frame2 = snapshot(collectDraws(root, backend));

    expect(frame2).toEqual(frame1);

    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: pooled fragment snapshot (Slice 3, F11a)', () => {
  interface FragmentCarrier {
    _fragment: RetainedGroupFragment;
  }

  // Flatten every record object (draws, groups, barriers) plus each draw's
  // material-key object in traversal order, so identity can be compared
  // across recaptures.
  const gatherRecords = (entries: readonly RetainedFragmentEntry[], out: object[]): void => {
    for (const entry of entries) {
      out.push(entry);

      if (entry.kind === RenderEntryKind.Draw) {
        out.push(entry.material);
      } else if (entry.kind === RenderEntryKind.Group) {
        gatherRecords(entry.entries, out);
      }
    }
  };

  test('recapture of a same-shaped subtree reuses every capture record in place (zero record allocations)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const leafA = new LeafDrawable('a');
    const clipped = new LeafDrawable('clipped');

    clipped.clip = true;
    clipped.clipShape = new Rectangle(0, 0, 8, 8);
    mid.addChild(leafA);
    group.addChild(mid);
    group.addChild(clipped); // direct-child barrier -> barrier record
    group.addChild(new LeafDrawable('b'));
    root.addChild(group);

    collectDraws(root, backend); // frame 1: full collect + capture

    const fragment = (group as unknown as FragmentCarrier)._fragment;
    const entriesBefore = fragment.entries;
    const recordsBefore: object[] = [];

    gatherRecords(entriesBefore, recordsBefore);
    expect(recordsBefore.length).toBeGreaterThan(0);

    leafA.setTint(new Color(7, 7, 7)); // content-dirty -> recapture on next collect
    leafA.setPosition(7, 7); // the move rides along so the fresh bounds are observable

    const frame2 = collectDraws(root, backend); // frame 2: full collect + pooled recapture

    // Same-shaped subtree: the root entry list and every record object
    // (including nested group entry arrays and material keys) are the SAME
    // objects, mutated in place -- steady-state recapture allocates zero.
    expect(fragment.entries).toBe(entriesBefore);

    const recordsAfter: object[] = [];

    gatherRecords(fragment.entries, recordsAfter);

    expect(recordsAfter.length).toBe(recordsBefore.length);

    for (let i = 0; i < recordsBefore.length; i++) {
      expect(recordsAfter[i]).toBe(recordsBefore[i]);
    }

    // ...and the refreshed data is the NEW data, not the stale capture.
    const drawA = frame2.find(d => (d.drawable as LeafDrawable).id === 'a');

    expect(drawA?.minX).toBe(7);

    root.destroy();
    backend.destroy();
  });

  test('pools grow with the subtree and reuse the grown records after a shrink', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    group.addChild(leafA);
    root.addChild(group);

    collectDraws(root, backend); // capture with 1 draw
    collectDraws(root, backend); // splice (marks the capture replayed, so the F11b thrash guard stays out of the way)

    const fragment = (group as unknown as FragmentCarrier)._fragment;
    const firstRecord = fragment.entries[0]!;

    group.addChild(leafB);
    collectDraws(root, backend); // capture with 2 draws (pool grows)
    collectDraws(root, backend); // splice

    expect(fragment.entries).toHaveLength(2);
    expect(fragment.entries[0]).toBe(firstRecord);

    const secondRecord = fragment.entries[1]!;

    group.removeChild(leafB);
    collectDraws(root, backend); // capture with 1 draw (pool keeps record 2)
    collectDraws(root, backend); // splice

    expect(fragment.entries).toHaveLength(1);
    expect(fragment.entries[0]).toBe(firstRecord);

    group.addChild(leafB);
    collectDraws(root, backend); // grow again: pooled record 2 is reused

    expect(fragment.entries).toHaveLength(2);
    expect(fragment.entries[1]).toBe(secondRecord);

    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: invalidation gates and view independence', () => {
  test('camera pan does NOT drop the fragment (no viewUpdateId in the key)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    collectDraws(root, backend);

    // A real pan (bumps View.updateId) small enough that the group's 0..16
    // world AABB still overlaps the 800x600 view centered here — a large pan
    // would legitimately whole-group-cull it (spec 6), which is a different
    // code path than the one this test pins.
    backend.view.setCenter(50, 50);

    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');
    const draws = collectDraws(root, backend);

    expect(materialSpy).not.toHaveBeenCalled(); // spliced despite the pan
    expect(draws).toHaveLength(1);

    root.destroy();
    backend.destroy();
  });

  test('moving the GROUP does not drop the fragment; the plan still carries the group node live', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    collectDraws(root, backend);
    group.setPosition(50, 50);

    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');
    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(root, backend);

    expect(materialSpy).not.toHaveBeenCalled(); // fragment survived the move

    const groupEntry = findGroupEntryFor(plan.passes[0]!.root, group);

    expect(groupEntry).toBeDefined();

    if (groupEntry !== undefined) {
      expect(groupEntry.scope.transformNode).toBe(group);
      // Live read at play time resolves the NEW matrix.
      expect(groupEntry.scope.transformNode!.getGlobalTransform().x).toBe(50);
    }

    RenderPlanBuilder.release(builder);
    root.destroy();
    backend.destroy();
  });

  test('a CONTENT child mutation inside the group forces one full re-collect, then retains again', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    collectDraws(root, backend);
    // Slice 4b: a transform move would be patched, not re-collected — use a
    // genuine content change (tint) to force the invalidate -> re-collect rung.
    leaf.setTint(new Color(200, 0, 0));

    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');

    collectDraws(root, backend); // dirty frame: full re-collect recomputes the material key

    expect(materialSpy).toHaveBeenCalled();

    materialSpy.mockClear();
    collectDraws(root, backend);

    expect(materialSpy).not.toHaveBeenCalled(); // re-retained

    root.destroy();
    backend.destroy();
  });

  test('adding/removing a child (structure) forces a re-collect', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new LeafDrawable('a'));
    root.addChild(group);
    collectDraws(root, backend);

    group.addChild(new LeafDrawable('b'));

    expect(collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id)).toEqual(['a', 'b']);

    root.destroy();
    backend.destroy();
  });

  test('a barrier-bearing direct child re-dispatches through _collect on every spliced frame', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const clipped = new LeafDrawable('clipped');

    clipped.clip = true;
    clipped.clipShape = new Rectangle(0, 0, 8, 8);
    group.addChild(clipped);
    group.addChild(new LeafDrawable('plain'));
    root.addChild(group);

    collectDraws(root, backend); // capture (fragment holds a barrier record + one draw)

    const collectSpy = vi.spyOn(clipped, '_collect');

    collectDraws(root, backend); // spliced frame

    expect(collectSpy).toHaveBeenCalledTimes(1); // re-dispatched, not captured

    root.destroy();
    backend.destroy();
  });

  test('a nested RetainedContainer is captured inside the outer fragment with its own transformNode', () => {
    const backend = createTestBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();

    inner.addChild(new LeafDrawable('a'));
    outer.addChild(inner);
    root.addChild(outer);

    collectDraws(root, backend); // capture

    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(root, backend); // spliced
    const outerEntry = findGroupEntryFor(plan.passes[0]!.root, outer);

    expect(outerEntry).toBeDefined();

    if (outerEntry !== undefined) {
      expect(outerEntry.scope.transformNode).toBe(outer);

      const innerEntry = findGroupEntryFor(outerEntry.scope, inner);

      expect(innerEntry).toBeDefined();

      if (innerEntry !== undefined) {
        expect(innerEntry.scope.transformNode).toBe(inner); // survives snapshot -> replay
      }
    }

    RenderPlanBuilder.release(builder);
    root.destroy();
    backend.destroy();
  });

  test('a deep barrier keeps retention for sibling branches; removing it returns the whole group to the splice', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const staticMid = new Container();
    const mid = new Container();
    const deep = new LeafDrawable('deep');

    deep.cacheAsBitmap = true; // barrier at depth 2 -> mid's branch escapes (F13/R3)
    staticMid.addChild(new LeafDrawable('a'));
    mid.addChild(deep);
    group.addChild(staticMid);
    group.addChild(mid);
    root.addChild(group);

    collectDraws(root, backend);
    expect(group._isTransformGroupBoundary).toBe(true); // never disengages

    // Clean frame: the static sibling splices from the fragment while ONLY
    // the escaped branch re-dispatches live.
    const staticCollectSpy = vi.spyOn(staticMid, '_collect');
    const escapedCollectSpy = vi.spyOn(mid, '_collect');

    collectDraws(root, backend);
    expect(staticCollectSpy).not.toHaveBeenCalled();
    expect(escapedCollectSpy).toHaveBeenCalledTimes(1);

    // Remove the deep barrier: the branch re-joins the group, capture, then
    // the whole group splices with no walk at all.
    deep.cacheAsBitmap = false;
    collectDraws(root, backend); // full collect + capture

    staticCollectSpy.mockClear();
    escapedCollectSpy.mockClear();
    collectDraws(root, backend); // spliced

    expect(staticCollectSpy).not.toHaveBeenCalled();
    expect(escapedCollectSpy).not.toHaveBeenCalled();

    root.destroy();
    backend.destroy();
  });

  test('optimizer audit: the group scope is its own segment — no reorder across the boundary despite mixed spaces', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const before = new LeafDrawable('world-before');
    const inside = new LeafDrawable('group-local');
    const after = new LeafDrawable('world-after');

    // World draws overlap the group draw NUMERICALLY (group-local 0..16 vs
    // world 0..16) but live in different spaces; the segment boundary must
    // prevent any cross-space comparison/merge (spec §6, recon §12 audit).
    group.addChild(inside);
    root.addChild(before);
    root.addChild(group);
    root.addChild(after);

    const order = collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id);

    expect(order).toEqual(['world-before', 'group-local', 'world-after']);

    // Second (spliced) frame preserves the same segmented order.
    const order2 = collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id);

    expect(order2).toEqual(order);

    root.destroy();
    backend.destroy();
  });

  test('deferred verification point: a moved, spliced RetainedContainer plays back through RenderPlanPlayer with the group matrix composed onto its children', () => {
    // Pins the player compose order end-to-end (RenderPlanPlayer._playGroup,
    // not just the builder's plan shape): a moved RetainedContainer whose
    // fragment is SPLICED (not re-collected) must still drive
    // `_setRenderGroupTransform` with the live group world matrix at play
    // time, and the drawable underneath must be issued while that transform
    // is active -- exactly the group x relative-world composition spec 4.3/5
    // promises. Uses a mock/spy backend rather than a real GPU backend.
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    // Frame 1: full collect + capture.
    const builder1 = RenderPlanBuilder.acquire();

    builder1.build(root, backend);
    RenderPlanBuilder.release(builder1);

    group.setPosition(50, 50);

    // Frame 2: the fragment survives the group move (pinned above) -- splice.
    const builder2 = RenderPlanBuilder.acquire();
    const plan = builder2.build(root, backend);

    RenderPlanBuilder.release(builder2);

    let activeTransform: Matrix | null = null;
    const drawsSeenUnderTransform: Array<{ id: string; x: number | null }> = [];

    const playbackBackend: RenderBackend = {
      ...backend,
      _setRenderGroupTransform(transform: Matrix | null) {
        activeTransform = transform;
      },
      draw(drawable: Drawable) {
        drawsSeenUnderTransform.push({ id: (drawable as LeafDrawable).id, x: activeTransform?.x ?? null });

        return this;
      },
    } as unknown as RenderBackend;

    RenderPlanPlayer.play(plan, playbackBackend);

    expect(drawsSeenUnderTransform).toEqual([{ id: 'a', x: 50 }]);

    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: alpha/tint staleness guard (spec 8, plan D-P2)', () => {
  test('the engine has no container-level alpha/tint surface that could bypass invalidation', () => {
    const group = new RetainedContainer();

    // Pin the D-P2 ground truth: if someone later ADDS Container.alpha or
    // Container.tint, this test fails and forces them to decide the guard
    // shape (fold into per-group uniform data vs invalidate) explicitly.
    expect('alpha' in group).toBe(false);
    expect('tint' in group).toBe(false);

    group.destroy();
  });

  test('a tint (incl. alpha channel) change on a drawable inside the group drops the fragment', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    collectDraws(root, backend); // capture

    leaf.setTint(new Color(255, 0, 0, 0.5));

    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');

    collectDraws(root, backend);

    // A real re-collect happened (Pixi #10757 class: tint/alpha must never
    // be served from a stale retained frame).
    expect(materialSpy).toHaveBeenCalled();

    root.destroy();
    backend.destroy();
  });

  test("toggling the group's own visibility is honored immediately (structure-dirty + collect gate)", () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new LeafDrawable('a'));
    root.addChild(group);

    expect(collectDraws(root, backend)).toHaveLength(1);

    group.visible = false;

    expect(collectDraws(root, backend)).toHaveLength(0);

    group.visible = true;

    expect(collectDraws(root, backend)).toHaveLength(1);

    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: capture suppression under thrash (Slice 3, F11b)', () => {
  test('continuous per-frame mutation performs a bounded number of captures, then plain collects only', () => {
    const backend = createTestBackend();
    const captureSpy = vi.spyOn(RetainedGroupFragment.prototype, 'capture');

    captureSpy.mockClear();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    for (let frame = 0; frame < 120; frame++) {
      // Slice 4b: a move is patched, not invalidating — thrash the CONTENT
      // channel (a per-frame distinct tint) to exercise the suppression path.
      leaf.setTint(new Color((frame % 200) + 1, 0, 0));
      collectDraws(root, backend);
    }

    // F1 captures fresh; F2 recaptures once (single-shot grace, so a lone
    // mutation between replays keeps Slice-2 recapture behavior); from F3 on
    // the fragment knows the captures are pure waste and every dirty frame is
    // a plain collect. Bounded — NOT O(frames).
    expect(captureSpy).toHaveBeenCalledTimes(2);

    captureSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });

  test('suppressed dirty frames still collect fresh data (pitfall 14: suppression never serves stale state)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    for (let frame = 0; frame < 10; frame++) {
      // Content thrash (tint) keeps every frame dirty; the move rides along so
      // the fresh-data check can still assert the current position.
      leaf.setTint(new Color((frame % 200) + 1, 0, 0));
      leaf.setPosition(frame, 0);

      const draws = collectDraws(root, backend);

      expect(draws[0]!.minX).toBe(frame); // every frame renders the CURRENT position
    }

    root.destroy();
    backend.destroy();
  });

  test('when mutation stops, the next frame does one full collect + capture and subsequent frames splice', () => {
    const backend = createTestBackend();
    const captureSpy = vi.spyOn(RetainedGroupFragment.prototype, 'capture');

    captureSpy.mockClear();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    for (let frame = 0; frame < 8; frame++) {
      leaf.setTint(new Color((frame % 200) + 1, 0, 0)); // content thrash
      leaf.setPosition(frame, 0);
      collectDraws(root, backend); // thrash: suppression active from frame 3 on
    }

    expect(captureSpy).toHaveBeenCalledTimes(2);

    // Mutation stops. The first would-have-been-clean frame finds no capture:
    // one full collect + capture (one frame late, self-correcting).
    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');
    const recovery = collectDraws(root, backend);

    expect(materialSpy).toHaveBeenCalled();
    expect(captureSpy).toHaveBeenCalledTimes(3);
    expect(recovery[0]!.minX).toBe(7);

    // ...and from then on the fragment splices again.
    materialSpy.mockClear();

    const spliced = collectDraws(root, backend);

    expect(materialSpy).not.toHaveBeenCalled();
    expect(captureSpy).toHaveBeenCalledTimes(3);
    expect(spliced[0]!.minX).toBe(7);

    captureSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });

  test('a single mutation between replays keeps the Slice-2 recapture behavior (no suppression)', () => {
    const backend = createTestBackend();
    const captureSpy = vi.spyOn(RetainedGroupFragment.prototype, 'capture');

    captureSpy.mockClear();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    // Steady replay-mutate-replay cadence: every dirty frame recaptures
    // because the previous capture WAS replayed at least once.
    collectDraws(root, backend); // capture 1
    collectDraws(root, backend); // splice
    leaf.setTint(new Color(5, 5, 5)); // single content mutation between replays
    collectDraws(root, backend); // capture 2
    collectDraws(root, backend); // splice
    leaf.setTint(new Color(9, 9, 9));
    collectDraws(root, backend); // capture 3

    expect(captureSpy).toHaveBeenCalledTimes(3);

    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');

    collectDraws(root, backend); // splice again

    expect(materialSpy).not.toHaveBeenCalled();

    captureSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: dev diagnostic for pathological invalidation (S2-D1)', () => {
  test('warns once when the fragment invalidates on effectively every frame of the observation window', () => {
    const backend = createTestBackend();
    const warnSpy = vi.spyOn(logger, 'warn');
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.name = 'hud';
    group.addChild(leaf);
    root.addChild(group);

    // 121 collects, each preceded by a child mutation -> every build after
    // the first is an invalidation of an existing capture.
    for (let frame = 0; frame <= 120; frame++) {
      leaf.setTint(new Color((frame % 200) + 1, 0, 0)); // per-frame content invalidation
      collectDraws(root, backend);
    }

    const retainedWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('RetainedContainer'));

    expect(retainedWarnings).toHaveLength(1);
    expect(String(retainedWarnings[0]![0])).toContain('hud');

    // Keep mutating far past the window: still exactly one warning.
    for (let frame = 0; frame < 130; frame++) {
      leaf.setTint(new Color((frame % 200) + 1, 1, 0));
      collectDraws(root, backend);
    }

    expect(warnSpy.mock.calls.filter(call => String(call[0]).includes('RetainedContainer'))).toHaveLength(1);

    warnSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });

  test('a mostly-static group (occasional invalidation) never warns', () => {
    const backend = createTestBackend();
    const warnSpy = vi.spyOn(logger, 'warn');
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    root.addChild(group);

    for (let frame = 0; frame < 300; frame++) {
      if (frame % 10 === 0) {
        leaf.setTint(new Color((frame % 200) + 1, 0, 0)); // 10% content invalidation rate
      }

      collectDraws(root, backend);
    }

    expect(warnSpy.mock.calls.filter(call => String(call[0]).includes('RetainedContainer'))).toHaveLength(0);

    warnSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: group-local bounds aggregate cache (F12)', () => {
  test('moving the group N times aggregates the children ONCE; each move only re-lifts by the world matrix', () => {
    const group = new RetainedContainer();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    leafB.setPosition(100, 0);
    group.addChild(leafA);
    group.addChild(leafB);

    group.getBounds(); // settle: one full aggregation

    const boundsSpyA = vi.spyOn(leafA, 'getBounds');
    const boundsSpyB = vi.spyOn(leafB, 'getBounds');

    for (let move = 1; move <= 10; move++) {
      group.setPosition(move * 10, move * 5);

      const bounds = group.getBounds();

      // Correctness on every move: group-local 0..116 x 0..16 lifted by the
      // new translation.
      expect(bounds.left).toBe(move * 10);
      expect(bounds.top).toBe(move * 5);
      expect(bounds.right).toBe(move * 10 + 116);
      expect(bounds.bottom).toBe(move * 5 + 16);
    }

    // The aggregate was served from the cache: no per-child bounds work.
    expect(boundsSpyA).not.toHaveBeenCalled();
    expect(boundsSpyB).not.toHaveBeenCalled();

    group.destroy();
  });

  test('a child mutation invalidates the aggregate and recomputes it once', () => {
    const group = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    group.addChild(leaf);
    group.getBounds(); // settle

    leaf.setPosition(50, 0);

    const bounds = group.getBounds();

    expect(bounds.right).toBe(66); // fresh aggregate: 50 + 16

    const boundsSpy = vi.spyOn(leaf, 'getBounds');

    group.setPosition(10, 0);
    group.getBounds();

    expect(boundsSpy).not.toHaveBeenCalled(); // re-cached after the recompute

    group.destroy();
  });

  test('hiding a child drops it from the aggregate on the next bounds refresh (structure-revision key)', () => {
    const group = new RetainedContainer();
    const near = new LeafDrawable('near');
    const far = new LeafDrawable('far');

    far.setPosition(1000, 0);
    group.addChild(near);
    group.addChild(far);

    expect(group.getBounds().right).toBe(1016);

    // NOTE: a visibility flip alone does not dirty bounds anywhere in the
    // engine (pre-existing SceneNode contract, plain Container included);
    // what the cache MUST NOT do is keep serving the hidden child once a
    // bounds refresh does run — the structure revision keys the aggregate.
    far.visible = false;
    group.setPosition(10, 0);

    expect(group.getBounds().right).toBe(26); // 10 + near's 16, far dropped

    group.destroy();
  });

  test('a barrier-bearing direct child stays world-space and follows its own moves', () => {
    const group = new RetainedContainer();
    const clipped = new LeafDrawable('clipped');
    const plain = new LeafDrawable('plain');

    clipped.clip = true;
    clipped.clipShape = new Rectangle(0, 0, 8, 8);
    group.addChild(clipped);
    group.addChild(plain);
    group.setPosition(100, 0);

    // plain: group-local 0..16 lifted to 100..116; clipped (escaped): world
    // 100..116 as well (group translation composes into ITS global directly).
    expect(group.getBounds().right).toBe(116);

    clipped.setPosition(200, 0);

    // clipped world rect is now 300..316.
    expect(group.getBounds().right).toBe(316);

    group.destroy();
  });

  test('a NESTED RetainedContainer child follows its own decoupled moves (no content-revision bump)', () => {
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const leaf = new LeafDrawable('a');

    inner.addChild(leaf);
    outer.addChild(inner);

    expect(outer.getBounds().right).toBe(16);

    // Inner-group moves bump only its group-matrix version — the outer
    // aggregate must not serve a stale rect for it.
    inner.setPosition(500, 0);

    expect(outer.getBounds().right).toBe(516);

    outer.destroy();
  });
});

describe('RetainedContainer: deep-barrier escape scoped to the offending sub-branch (F13/R3)', () => {
  test('a deep barrier escapes only its own branch: the boundary stays engaged and siblings stay group-relative', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepClipped = new LeafDrawable('deep');
    const plainLeaf = new LeafDrawable('plain');

    deepClipped.clip = true;
    deepClipped.clipShape = new Rectangle(0, 0, 8, 8);
    mid.setPosition(10, 0);
    mid.addChild(deepClipped);
    group.setPosition(40, 0);
    group.addChild(mid);
    group.addChild(plainLeaf);
    root.addChild(group);

    collectDraws(root, backend);

    // The group stays a live boundary — only the offending branch leaves it.
    expect(group._isTransformGroupBoundary).toBe(true);
    expect(mid.getGlobalTransform().x).toBe(50); // escaped branch: world (40 + 10)
    expect(deepClipped.getGlobalTransform().x).toBe(50); // its subtree is world-space wholesale
    expect(plainLeaf.getGlobalTransform().x).toBe(0); // untouched sibling: still group-relative

    root.destroy();
    backend.destroy();
  });

  test('retention survives a deep barrier: a clean frame splices sibling draws and re-dispatches only the escaped branch', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const staticMid = new Container();
    const leafA = new LeafDrawable('a');
    const dirtyMid = new Container();
    const deepClipped = new LeafDrawable('deep');

    deepClipped.clip = true;
    deepClipped.clipShape = new Rectangle(0, 0, 8, 8);
    staticMid.addChild(leafA);
    dirtyMid.addChild(deepClipped);
    group.addChild(staticMid);
    group.addChild(dirtyMid);
    root.addChild(group);

    const frame1 = snapshot(collectDraws(root, backend)); // full collect + capture

    const boundsSpyA = vi.spyOn(leafA, 'getBounds');
    const materialSpyA = vi.spyOn(leafA, '_getOrComputeMaterialKey');
    const staticCollectSpy = vi.spyOn(staticMid, '_collect');
    const dirtyCollectSpy = vi.spyOn(dirtyMid, '_collect');

    const frame2 = snapshot(collectDraws(root, backend)); // clean frame: splice

    // The static sibling branch replays from the fragment — no walk, no
    // bounds, no material keys (the F13 cliff was losing exactly this).
    expect(staticCollectSpy).not.toHaveBeenCalled();
    expect(boundsSpyA).not.toHaveBeenCalled();
    expect(materialSpyA).not.toHaveBeenCalled();

    // The escaped branch re-dispatches live every frame (world-space, like a
    // direct barrier child).
    expect(dirtyCollectSpy).toHaveBeenCalledTimes(1);

    expect(frame2.map(d => d.id)).toEqual(frame1.map(d => d.id));

    root.destroy();
    backend.destroy();
  });

  test('plan shape: the group keeps its transformNode and the escaped branch sits behind a barrier entry that suspends it', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const staticMid = new Container();
    const dirtyMid = new Container();
    const deepClipped = new LeafDrawable('deep');

    deepClipped.clip = true;
    deepClipped.clipShape = new Rectangle(0, 0, 8, 8);
    staticMid.addChild(new LeafDrawable('a'));
    dirtyMid.addChild(deepClipped);
    group.addChild(staticMid);
    group.addChild(dirtyMid);
    root.addChild(group);

    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(root, backend);
    const groupEntry = findGroupEntryFor(plan.passes[0]!.root, group);

    expect(groupEntry).toBeDefined();
    expect(groupEntry!.scope.transformNode).toBe(group);

    // The escaped branch is wrapped in a barrier entry (group-transform
    // suspension at playback) with NO actual effect of its own.
    const barrierEntries = groupEntry!.scope.entries.filter(entry => entry.kind === RenderEntryKind.Barrier);

    expect(barrierEntries).toHaveLength(1);

    const escaped = barrierEntries[0]!;

    if (escaped.kind === RenderEntryKind.Barrier) {
      expect(escaped.scope.node).toBe(dirtyMid);
      expect(escaped.scope.effect.filters).toHaveLength(0);
      expect(escaped.scope.effect.maskSource).toBeNull();
      expect(escaped.scope.effect.cacheAsBitmap).toBe(false);

      const branchDraws: DrawCommand[] = [];

      gatherScopeDraws(escaped.scope.childPlan!, branchDraws);
      expect(branchDraws.map(d => (d.drawable as LeafDrawable).id)).toEqual(['deep']);
    }

    RenderPlanBuilder.release(builder);
    root.destroy();
    backend.destroy();
  });

  test('runtime toggle: removing the deep barrier re-engages the branch without the group ever disengaging', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepClipped = new LeafDrawable('deep');

    deepClipped.clip = true;
    deepClipped.clipShape = new Rectangle(0, 0, 8, 8);
    mid.setPosition(10, 0);
    mid.addChild(deepClipped);
    group.addChild(mid);
    group.setPosition(40, 0);
    root.addChild(group);

    collectDraws(root, backend);
    expect(group._isTransformGroupBoundary).toBe(true);
    expect(mid.getGlobalTransform().x).toBe(50); // escaped: world

    deepClipped.clip = false; // content-dirty -> re-scan on next collect

    collectDraws(root, backend);
    expect(group._isTransformGroupBoundary).toBe(true);
    expect(mid.getGlobalTransform().x).toBe(10); // group-relative again (lazy recombine)

    // And the branch is retained again: a clean frame splices with no walk.
    collectDraws(root, backend);

    const collectSpy = vi.spyOn(mid, '_collect');

    collectDraws(root, backend);
    expect(collectSpy).not.toHaveBeenCalled();

    root.destroy();
    backend.destroy();
  });

  test('a barrier direct child of a NESTED group escapes the nested-group branch of the outer group; both boundaries stay engaged', () => {
    const backend = createTestBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const directBarrier = new LeafDrawable('direct');

    directBarrier.clip = true;
    directBarrier.clipShape = new Rectangle(0, 0, 8, 8);
    inner.setPosition(5, 0);
    inner.addChild(directBarrier);
    outer.setPosition(40, 0);
    outer.addChild(inner);
    root.addChild(outer);

    collectDraws(root, backend);

    // Depth 1 for inner (supported escape); depth 2 for outer: the outer
    // group escapes ONLY the inner branch instead of disengaging.
    expect(inner._isTransformGroupBoundary).toBe(true);
    expect(outer._isTransformGroupBoundary).toBe(true);
    expect(inner.getGlobalTransform().x).toBe(45); // escaped branch: true world
    expect(directBarrier.getGlobalTransform().x).toBe(45); // escapes inner too: world

    root.destroy();
    backend.destroy();
  });

  test('an escape flip notifies bounds invalidation for the escaped branch only, not for unaffected siblings', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deep = new LeafDrawable('deep');
    const siblingLeaf = new LeafDrawable('sibling');

    mid.addChild(deep);
    group.addChild(mid);
    group.addChild(siblingLeaf);
    root.addChild(group);

    const invalidated: unknown[] = [];
    const stage = {
      interaction: {
        _notifyNodeAdded: () => {},
        _notifyNodeRemoved: () => {},
        _notifyInteractiveChanged: () => {},
        _notifyBoundsInvalidated: (node: unknown) => invalidated.push(node),
      },
      focus: { _notifyNodeRemoved: () => {} },
      app: {},
    } as unknown as Stage;

    root._setStage(stage);

    collectDraws(root, backend); // engaged, settled

    deep.clip = true; // deep barrier -> next collect escapes mid's branch
    deep.clipShape = new Rectangle(0, 0, 8, 8);
    invalidated.length = 0;

    collectDraws(root, backend);

    expect(group._isTransformGroupBoundary).toBe(true);
    expect(invalidated).toContain(mid);
    expect(invalidated).toContain(deep);
    expect(invalidated).not.toContain(siblingLeaf); // its space never changed

    // Re-engage: the reverse flip must notify the branch again.
    deep.clip = false;
    invalidated.length = 0;

    collectDraws(root, backend);

    expect(invalidated).toContain(mid);
    expect(invalidated).toContain(deep);
    expect(invalidated).not.toContain(siblingLeaf);

    root.destroy();
    backend.destroy();
  });

  test('escaping warns once in dev builds, naming the container and the sub-branch semantics', () => {
    const backend = createTestBackend();
    const warnSpy = vi.spyOn(logger, 'warn');
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepClipped = new LeafDrawable('deep');

    group.name = 'decor';
    deepClipped.clip = true;
    deepClipped.clipShape = new Rectangle(0, 0, 8, 8);
    mid.addChild(deepClipped);
    group.addChild(mid);
    root.addChild(group);

    collectDraws(root, backend);
    collectDraws(root, backend);

    const escapeWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('sub-branch'));

    expect(escapeWarnings).toHaveLength(1);
    expect(String(escapeWarnings[0]![0])).toContain('decor');

    warnSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer: destroyed-child eviction (P3f)', () => {
  test('a child destroy()ed without removeChild is evicted from the replay next frame and warns once', () => {
    const backend = createTestBackend();
    const warnSpy = vi.spyOn(logger, 'warn');
    const root = new Container();
    const group = new RetainedContainer();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    group.name = 'decor';
    group.addChild(leafA);
    group.addChild(leafB);
    root.addChild(group);

    // Frame 1: full collect + capture (both children present).
    expect(collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id)).toEqual(['a', 'b']);

    // The footgun: destroy WITHOUT removeChild — the child stays attached, so
    // no revision bump and the fragment is still "clean".
    leafA.destroy();

    // Frame 2: the retained fragment must NOT replay the destroyed drawable.
    const frame2 = collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id);
    expect(frame2).toEqual(['b']);
    expect(frame2).not.toContain('a');

    // Frame 3: still evicted, and no per-frame warning storm.
    const frame3 = collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id);
    expect(frame3).toEqual(['b']);

    const destroyedWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('destroy'));

    expect(destroyedWarnings).toHaveLength(1);
    expect(String(destroyedWarnings[0]![0])).toContain('decor');

    warnSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });

  test('a destroyed drawable nested in a plain sub-container is also evicted', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    mid.addChild(leafA);
    group.addChild(mid);
    group.addChild(leafB);
    root.addChild(group);

    expect(
      collectDraws(root, backend)
        .map(d => (d.drawable as LeafDrawable).id)
        .sort(),
    ).toEqual(['a', 'b']);

    leafA.destroy();

    const frame2 = collectDraws(root, backend).map(d => (d.drawable as LeafDrawable).id);

    expect(frame2).toEqual(['b']);

    root.destroy();
    backend.destroy();
  });
});
