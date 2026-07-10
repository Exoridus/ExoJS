import { logger } from '#core/logging';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
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

  test('mutations INSIDE the subtree still content-dirty the container (existing D7 propagation)', () => {
    const group = new RetainedContainer();
    const leaf = new Drawable();

    group.addChild(leaf);

    const before = group._contentRevision;

    leaf.setPosition(3, 3);

    expect(group._contentRevision).toBeGreaterThan(before);

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

describe('RetainedContainer: deep-barrier fallback (plan D-P4, spec 8)', () => {
  test('a barrier nested deeper than one level disengages the boundary: descendants go world-space', () => {
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

    // Engagement is (re-)evaluated at the top of the group's _collect.
    collectDraws(root, backend);

    expect(group._isTransformGroupBoundary).toBe(false);
    expect(mid.getGlobalTransform().x).toBe(50); // world (40 + 10), not group-relative 10
    expect(plainLeaf.getGlobalTransform().x).toBe(40); // world, not group-relative 0

    root.destroy();
    backend.destroy();
  });

  test('the disengaged plan is unmarked and byte-identical to a plain Container scene', () => {
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
      groupNode.addChild(new LeafDrawable('plain'));
      sceneRoot.addChild(groupNode);

      return sceneRoot;
    };

    const plainRoot = buildScene(new Container());
    const retainedRoot = buildScene(new RetainedContainer());

    expect(snapshot(collectDraws(retainedRoot, backend))).toEqual(snapshot(collectDraws(plainRoot, backend)));

    // And the scope carries NO transformNode (group uniform stays identity).
    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(retainedRoot, backend);
    const groupEntry = plan.passes[0]!.root.entries.find(entry => entry.kind === RenderEntryKind.Group);

    expect(groupEntry).toBeDefined();

    if (groupEntry?.kind === RenderEntryKind.Group) {
      expect(groupEntry.scope.transformNode).toBeNull();
    }

    RenderPlanBuilder.release(builder);
    plainRoot.destroy();
    retainedRoot.destroy();
    backend.destroy();
  });

  test('runtime toggle: removing the deep barrier re-engages the boundary on the next collect', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepClipped = new LeafDrawable('deep');

    deepClipped.clip = true;
    deepClipped.clipShape = new Rectangle(0, 0, 8, 8);
    mid.addChild(deepClipped);
    group.addChild(mid);
    group.setPosition(40, 0);
    root.addChild(group);

    collectDraws(root, backend);
    expect(group._isTransformGroupBoundary).toBe(false);

    deepClipped.clip = false; // structure-dirty (task 1) -> re-scan on next collect

    collectDraws(root, backend);
    expect(group._isTransformGroupBoundary).toBe(true);
    expect(mid.getGlobalTransform().x).toBe(0); // group-relative again (lazy recombine)

    root.destroy();
    backend.destroy();
  });

  test('a barrier DIRECT child does not disengage; a barrier direct child of a NESTED group disengages the outer group only', () => {
    const backend = createTestBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const directBarrier = new LeafDrawable('direct');

    directBarrier.clip = true;
    directBarrier.clipShape = new Rectangle(0, 0, 8, 8);
    inner.addChild(directBarrier);
    outer.addChild(inner);
    root.addChild(outer);

    collectDraws(root, backend);

    // Depth 1 for inner (supported escape) but depth 2 for outer: only the
    // outer boundary disengages, so inner.getGlobalTransform is true world
    // and the escaped barrier composes correctly.
    expect(inner._isTransformGroupBoundary).toBe(true);
    expect(outer._isTransformGroupBoundary).toBe(false);

    root.destroy();
    backend.destroy();
  });

  test('disengaging warns once in dev builds, naming the container', () => {
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

    const disengageWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('renders as a plain Container'));

    expect(disengageWarnings).toHaveLength(1);
    expect(String(disengageWarnings[0]![0])).toContain('decor');

    warnSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });
});
