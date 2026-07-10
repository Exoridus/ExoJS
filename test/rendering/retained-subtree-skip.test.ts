import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Mesh } from '#rendering/mesh/Mesh';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';

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

describe('static-subtree skip: output equivalence', () => {
  test('an unchanged scene collects identical draw data on the second (skip-eligible) frame as on the first (full) collect', () => {
    const backend = createTestBackend();
    const root = new Container();
    const mid = new Container();

    mid.addChild(new LeafDrawable('a'));
    mid.addChild(new LeafDrawable('b'));
    root.addChild(mid);
    root.addChild(new LeafDrawable('c'));

    const frame1 = snapshot(collectDraws(root, backend));
    const frame2 = snapshot(collectDraws(root, backend));

    expect(frame2).toEqual(frame1);
    expect(frame1.map(d => d.id)).toEqual(['a', 'b', 'c']);

    root.destroy();
    backend.destroy();
  });
});

describe('static-subtree skip: the fast path is actually taken', () => {
  test('a clean second frame does not call getBounds()/_getOrComputeMaterialKey() again for an unmoved leaf', () => {
    const backend = createTestBackend();
    const root = new Container();
    const leaf = new LeafDrawable('only');

    root.addChild(leaf);

    collectDraws(root, backend); // frame 1: full collect, captures the slot

    const boundsSpy = vi.spyOn(leaf, 'getBounds');
    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');

    collectDraws(root, backend); // frame 2: nothing changed -> should replay, not re-cull/re-key

    expect(boundsSpy).not.toHaveBeenCalled();
    expect(materialSpy).not.toHaveBeenCalled();

    root.destroy();
    backend.destroy();
  });
});

describe('static-subtree skip: mixed-z replay stays consistent (bookkeeping regression guard)', () => {
  test('replaying direct drawables with different zIndex keeps the scope genuinely mixed-z, so a trailing nested container sorts identically on the skip frame', () => {
    const backend = createTestBackend();
    const root = new Container();

    // Two direct-drawable children with DIFFERENT zIndex values so the parent
    // scope is genuinely mixed-z (zIndex set before the first collect, since the
    // zIndex setter does not itself dirty content/structure).
    const high = new LeafDrawable('high');

    high.zIndex = 5;
    const low = new LeafDrawable('low');

    low.zIndex = 1;

    // A trailing normally-collected nested container AFTER the drawables in the
    // same parent scope (zIndex 0 by default -> distinct from both leaves).
    const nested = new Container();

    nested.addChild(new LeafDrawable('nested'));

    root.addChild(high);
    root.addChild(low);
    root.addChild(nested);

    const frame1 = snapshot(collectDraws(root, backend)); // full collect
    const frame2 = snapshot(collectDraws(root, backend)); // skip-eligible: replays high+low, recollects nested

    // Byte-identical draw order AND seq values. Without the _replayRetainedDraw
    // bookkeeping fix, frame2's scope loses hasMixedZ, the optimizer skips the
    // z-sort, and the paint order diverges from frame1.
    expect(frame2).toEqual(frame1);
    expect(frame1.map(d => d.id)).toEqual(['nested', 'low', 'high']);

    root.destroy();
    backend.destroy();
  });
});

describe('static-subtree skip: invalidation gates', () => {
  test('adding a child forces a real recollect (structure-dirty)', () => {
    const backend = createTestBackend();
    const root = new Container();

    root.addChild(new LeafDrawable('a'));
    collectDraws(root, backend);

    root.addChild(new LeafDrawable('b'));
    const draws = collectDraws(root, backend);

    expect(draws.map(d => (d.drawable as LeafDrawable).id)).toEqual(['a', 'b']);

    root.destroy();
    backend.destroy();
  });

  test('moving a leaf is reflected on the very next collect (content-dirty forces recollect for that branch)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const leaf = new LeafDrawable('a');

    root.addChild(leaf);
    collectDraws(root, backend);

    leaf.setPosition(500, 500); // still likely in view at 800x600, bounds still change
    const draws = collectDraws(root, backend);

    expect(draws[0]!.minX).toBe(500);

    root.destroy();
    backend.destroy();
  });

  test('toggling visibility forces a real recollect (structure-dirty per D6)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const leaf = new LeafDrawable('a');

    root.addChild(leaf);
    collectDraws(root, backend);

    leaf.visible = false;
    const draws = collectDraws(root, backend);

    expect(draws).toHaveLength(0);

    root.destroy();
    backend.destroy();
  });

  test('moving the view forces a real recollect instead of trusting stale cull results', () => {
    const backend = createTestBackend();
    const root = new Container();
    const leaf = new LeafDrawable('a');

    leaf.setPosition(2000, 2000); // outside the 800x600 default view
    root.addChild(leaf);

    const firstDraws = collectDraws(root, backend);

    expect(firstDraws).toHaveLength(0); // culled

    backend.view.setCenter(2000, 2000); // pan the camera onto the leaf
    const secondDraws = collectDraws(root, backend);

    expect(secondDraws).toHaveLength(1); // must now be visible -- proves the cache did not blindly replay "0 entries"

    root.destroy();
    backend.destroy();
  });

  test('swapping the backend forces a real recollect instead of replaying against the previous backend', () => {
    const backendA = createTestBackend();
    const backendB = createTestBackend();
    const root = new Container();
    const leaf = new LeafDrawable('a');

    root.addChild(leaf);

    collectDraws(root, backendA); // capture keyed on backendA

    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');

    const draws = collectDraws(root, backendB); // different backend -> must not replay backendA's capture

    expect(materialSpy).toHaveBeenCalled();
    expect(draws.map(d => (d.drawable as LeafDrawable).id)).toEqual(['a']);

    root.destroy();
    backendA.destroy();
    backendB.destroy();
  });

  test('changing zIndex at runtime forces a real recollect instead of replaying a stale paint order', () => {
    const backend = createTestBackend();
    const root = new Container();
    const front = new LeafDrawable('front');
    const back = new LeafDrawable('back');

    front.zIndex = 1;
    back.zIndex = 2;

    root.addChild(front);
    root.addChild(back);

    const frame1 = collectDraws(root, backend); // full collect, captures both slots

    expect(frame1.map(d => (d.drawable as LeafDrawable).id)).toEqual(['front', 'back']);

    front.zIndex = 5; // bring 'front' to the very back, no other mutation

    const frame2 = collectDraws(root, backend); // skip-eligible unless zIndex dirties content

    expect(frame2.map(d => (d.drawable as LeafDrawable).id)).toEqual(['back', 'front']);

    root.destroy();
    backend.destroy();
  });

  test('a local-bounds change (Mesh.recomputeLocalBounds) forces a real recollect instead of replaying a stale extent', () => {
    const backend = createTestBackend();
    const root = new Container();

    // A per-frame-resized drawable (the "score counter" case) as a direct
    // child of an otherwise-static container. Mesh drives the exact buggy path:
    // recomputeLocalBounds() changes the rendered extent via
    // _invalidateBoundsCascade() ONLY -- historically without bumping the node
    // revision, so the static-subtree skip replayed a stale AABB.
    const mesh = new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 0, 10]) });

    root.addChild(mesh);
    root.addChild(new LeafDrawable('static-sibling'));

    const frame1 = collectDraws(root, backend); // full collect, captures the mesh slot
    const meshDraw1 = frame1.find(d => d.drawable === mesh);

    expect(meshDraw1).toBeDefined();
    expect(meshDraw1!.maxX).toBe(10);
    expect(meshDraw1!.maxY).toBe(10);

    // Grow the mesh in place -> local bounds (0,0,100,100). No other mutation.
    mesh.vertices[2] = 100; // x of second vertex
    mesh.vertices[5] = 100; // y of third vertex
    mesh.recomputeLocalBounds();

    const frame2 = collectDraws(root, backend); // skip-eligible unless the bounds change dirties content
    const meshDraw2 = frame2.find(d => d.drawable === mesh);

    // The replayed/collected slot must reflect the NEW extent. Without the
    // content-dirty routing in _invalidateBoundsCascade, frame2 replays the
    // stale slot and maxX/maxY stay at 10.
    expect(meshDraw2).toBeDefined();
    expect(meshDraw2!.maxX).toBe(100);
    expect(meshDraw2!.maxY).toBe(100);

    root.destroy();
    backend.destroy();
  });

  test('a Drawable with an active filter is never cached as a fast-path slot', async () => {
    const backend = createTestBackend();
    const root = new Container();
    const leaf = new LeafDrawable('a');
    const { Filter } = await import('#rendering/filters/Filter');

    class NoopFilter extends Filter {
      public override apply(): void {
        // no-op
      }
    }

    leaf.filters = [new NoopFilter()];
    root.addChild(leaf);

    collectDraws(root, backend);
    const materialSpy = vi.spyOn(leaf, '_getOrComputeMaterialKey');

    collectDraws(root, backend); // must still re-collect this child every time (barrier path, never captured)

    expect(materialSpy).toHaveBeenCalled();

    root.destroy();
    backend.destroy();
  });
});
