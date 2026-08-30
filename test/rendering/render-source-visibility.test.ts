import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { DerivedRootProduct } from '#rendering/plan/DerivedRootProduct';
import { FlatScanVisibility } from '#rendering/plan/FlatScanVisibility';
import { GridVisibility } from '#rendering/plan/GridVisibility';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { SourceScope } from '#rendering/plan/renderSourceItem';
import { MembershipBits, type VisibilityQueryStats } from '#rendering/plan/SourceVisibilityIndex';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { View } from '#rendering/View';

/**
 * Cut-2 visibility: the spatial index that answers which of a scope's items a
 * rect admits, and the membership delta that says how that answer changed.
 *
 * Two things are on trial here. That the grid agrees with the flat scan - it is
 * a faster way to compute the same set, and the scan is the rule's one
 * implementation, so any disagreement is a pixel difference. And that a camera
 * step really costs O(candidates + delta): the counters are the evidence, since
 * a strategy that quietly went back to O(N) would still paint correctly.
 */

class Leaf extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this._setLocalBounds(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true };

const createBackend = (): { backend: RenderBackend; draws: string[] } => {
  const renderTarget = new RenderTarget(800, 600, true);
  const draws: string[] = [];

  const backend = {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    rendererRegistry: {
      resolve(): unknown {
        return flaggedRenderer;
      },
    },
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return backend;
    },
    resetStats() {
      return backend;
    },
    clear() {
      return backend;
    },
    resize() {
      return backend;
    },
    setView(view: View) {
      renderTarget.setView(view);

      return backend;
    },
    setRenderTarget() {
      return backend;
    },
    pushScissorRect() {
      return backend;
    },
    popScissorRect() {
      return backend;
    },
    composeWithAlphaMask() {
      return backend;
    },
    acquireRenderTexture() {
      throw new Error('not used in this test');
    },
    releaseRenderTexture() {
      return backend;
    },
    draw(drawable: unknown) {
      draws.push((drawable as Leaf).id);

      return backend;
    },
    execute() {
      return backend;
    },
    flush() {
      return backend;
    },
    destroy() {
      renderTarget.destroy();
    },
    _endDrawPlan(): void {},
    _setRenderGroupTransform(): void {},
  } as unknown as RenderBackend;

  return { backend, draws };
};

const playFrame = (root: RenderNode, backend: RenderBackend): void => {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(root, backend);

    RenderPlanOptimizer.optimize(plan);
    RenderPlanPlayer.play(plan, backend);
  } finally {
    RenderPlanBuilder.release(builder);
  }
};

/** A view whose world rect is `[centerX-400, 0 .. centerX+400, 600]`. */
const viewAt = (centerX: number, centerY = 300): View => new View(centerX, centerY, 800, 600);

const makeRoot = <T extends RenderNode>(root: T): T => {
  root.cullable = false;

  return root;
};

const rootScopeOf = (root: RenderNode): SourceScope => {
  const scope = root._retainedRootRepresentation().source?.rootScope ?? null;

  if (scope === null) {
    throw new Error('the root has no persistent source');
  }

  return scope;
};

type SelectionDelta = DerivedRootProduct['delta'];

/**
 * A snapshot of the live delta record. The product reuses one object across
 * frames, so reading it into a variable and comparing after the next frame
 * would compare the record with itself.
 */
const deltaOf = (root: RenderNode): SelectionDelta => {
  const product = root._retainedRootRepresentation().derivedProduct;

  if (product === null) {
    throw new Error('the root has no derived product');
  }

  return { ...product.delta };
};

/**
 * Drive a product over the source's scopes directly, one rect at a time.
 *
 * Deliberately not through a frame: the frame path alternates between a
 * capturing collect (which culls against the view grown by the capture margin)
 * and a suppressed one (which culls against the view itself), so two frames at
 * the same camera position legitimately select different sets. These tests are
 * about the delta contract, so they hand the strategy the rect themselves.
 */
const selectDirectly = (
  product: DerivedRootProduct,
  scopes: readonly SourceScope[],
  rect: Rectangle,
  skip: ReadonlySet<number> = new Set<number>(),
): SelectionDelta => {
  const grid = new GridVisibility();

  product.beginSelection();

  for (const scope of scopes) {
    if (!skip.has(scope.ordinal)) {
      product.selectScope(scope, rect, grid);
    }
  }

  product.commitSelection(scopes);

  return { ...product.delta };
};

/**
 * Drive `root` to the tier where it selects from a persistent source and leave
 * the camera at `centerX`. The build gate wants two consecutive rebuild frames
 * over unchanged content, so the camera has to force a second rebuild first.
 */
const driveToSourceTier = (root: RenderNode, backend: RenderBackend, centerX = 400): void => {
  backend.setView(viewAt(400));
  playFrame(root, backend);

  backend.setView(viewAt(100_000));
  playFrame(root, backend);

  backend.setView(viewAt(centerX));
  playFrame(root, backend);
};

/** Lay `count` leaves along a row, `spacing` apart, starting at `startX`. */
const addRow = (parent: Container, count: number, startX: number, spacing: number, y = 300, prefix = 'n'): Leaf[] => {
  const leaves: Leaf[] = [];

  for (let i = 0; i < count; i++) {
    const leaf = new Leaf(`${prefix}${i}`);

    leaf.setPosition(startX + i * spacing, y);
    parent.addChild(leaf);
    leaves.push(leaf);
  }

  return leaves;
};

const emptyStats = (): VisibilityQueryStats => ({ cells: 0, candidates: 0 });

/** The item indices `strategy` admits, as a sorted array. */
const admitted = (scope: SourceScope, rect: Rectangle, strategy: FlatScanVisibility | GridVisibility): number[] => {
  const bits = new MembershipBits();

  bits.reset(scope.items.count);
  strategy.select(scope, rect, bits, emptyStats());

  const out: number[] = [];

  for (let i = 0; i < scope.items.count; i++) {
    if (bits.has(i)) {
      out.push(i);
    }
  }

  return out;
};

describe('source visibility: the grid answers exactly what the scan answers', () => {
  test('over a scrolling row, for every rect the camera passes through', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    addRow(root, 400, -2_000, 24);
    driveToSourceTier(root, backend);

    const scope = rootScopeOf(root);
    const scan = new FlatScanVisibility();
    const grid = new GridVisibility();

    for (let left = -2_400; left <= 8_000; left += 137) {
      const rect = new Rectangle(left, 0, 800, 600);

      expect(admitted(scope, rect, grid)).toEqual(admitted(scope, rect, scan));
      rect.destroy();
    }

    root.destroy();
    backend.destroy();
  });

  test('with negative and large world coordinates, and items far bigger than a cell', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    addRow(root, 60, -50_000, 31);
    addRow(root, 60, 900_000, 17, 200, 'far');

    // Two items that dwarf the derived cell size, so they leave the grid and are
    // answered live - the class that would otherwise widen every query to its
    // own extent.
    const huge = new Leaf('huge');

    huge._setLocalBounds(0, 0, 40_000, 900);
    huge.setPosition(-20_000, 0);
    root.addChild(huge);

    driveToSourceTier(root, backend);

    const scope = rootScopeOf(root);
    const scan = new FlatScanVisibility();
    const grid = new GridVisibility();

    for (const left of [-60_000, -50_010, -49_000, -20_500, 0, 500_000, 899_000, 900_500, 901_100, 2_000_000]) {
      const rect = new Rectangle(left, 0, 800, 600);

      expect(admitted(scope, rect, grid)).toEqual(admitted(scope, rect, scan));
      rect.destroy();
    }

    root.destroy();
    backend.destroy();
  });

  test('a non-cullable item is admitted by a rect nowhere near it', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());
    const anchored = new Leaf('anchored');
    const ordinary = new Leaf('ordinary');

    anchored.setPosition(500_000, 300);
    anchored.cullable = false;
    ordinary.setPosition(500_000, 300);
    root.addChild(anchored, ordinary);

    driveToSourceTier(root, backend);

    const scope = rootScopeOf(root);
    const rect = new Rectangle(0, 0, 800, 600);
    const grid = new GridVisibility();

    // Index 0 is `anchored`; `ordinary` sits at the same place but is culled.
    expect(admitted(scope, rect, grid)).toEqual([0]);
    expect(admitted(scope, rect, new FlatScanVisibility())).toEqual([0]);

    rect.destroy();
    root.destroy();
    backend.destroy();
  });

  test('an item whose cullArea is mutated in place is judged by the mutated rect', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());
    const leaf = new Leaf('a');
    // Replacing the reference stamps structure dirty; MUTATING the rectangle
    // stamps nothing, so this is the one input an index can never file.
    const area = new Rectangle(400_000, 300, 16, 16);

    leaf.setPosition(100, 300);
    leaf.cullArea = area;
    root.addChild(leaf);

    driveToSourceTier(root, backend);

    const scope = rootScopeOf(root);
    const rect = new Rectangle(0, 0, 800, 600);
    const grid = new GridVisibility();

    expect(admitted(scope, rect, grid)).toEqual([]);

    area.setPosition(100, 300);

    expect(admitted(scope, rect, grid)).toEqual([0]);

    rect.destroy();
    root.destroy();
    backend.destroy();
  });
});

describe('source visibility: membership delta', () => {
  test('a small camera step keeps most items and swaps a few', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    // 24 units apart, so an 800-wide view holds ~34 of them and a 240-unit step
    // swaps 10 at each edge.
    addRow(root, 400, -2_000, 24);
    driveToSourceTier(root, backend);

    const source = root._retainedRootRepresentation().source!;
    const product = new DerivedRootProduct();

    product.rebind(source.scopes);

    const settled = selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600));

    expect(settled.hadPrevious).toBe(false);
    expect(settled.entered).toBe(settled.visible);
    expect(settled.exited).toBe(0);
    expect(settled.visible).toBeGreaterThan(20);

    const delta = selectDirectly(product, source.scopes, new Rectangle(240, 0, 800, 600));

    expect(delta.hadPrevious).toBe(true);
    // The step moved the view by 240 of its 800 units, so most of the set is
    // the same set - and the counters, not the wall clock, are what say so.
    expect(delta.stayed).toBeGreaterThan(delta.entered + delta.exited);
    expect(delta.entered).toBe(10);
    expect(delta.exited).toBe(10);
    expect(delta.entered + delta.stayed).toBe(delta.visible);
    // The query never looked at the whole world.
    expect(delta.candidates).toBeLessThan(source.itemCount);

    root.destroy();
    backend.destroy();
  });

  test('a camera that does not move at all reports every item as stayed', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    addRow(root, 400, -2_000, 24);
    driveToSourceTier(root, backend);

    const source = root._retainedRootRepresentation().source!;
    const product = new DerivedRootProduct();

    product.rebind(source.scopes);
    selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600));

    const delta = selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600));

    expect(delta.visible).toBeGreaterThan(20);
    expect(delta.entered).toBe(0);
    expect(delta.exited).toBe(0);
    expect(delta.stayed).toBe(delta.visible);

    root.destroy();
    backend.destroy();
  });

  test('a group skipped as a whole reports its items as exited rather than losing them', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());
    const near = new Container();

    addRow(near, 12, 100, 20);
    root.addChild(near);
    addRow(root, 12, 120, 20, 300, 'r');

    driveToSourceTier(root, backend, 300);

    const source = root._retainedRootRepresentation().source!;
    const product = new DerivedRootProduct();

    expect(source.scopes).toHaveLength(2);

    product.rebind(source.scopes);

    const both = selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600));

    expect(both.visible).toBe(24);

    // The walk skips the nested scope entirely, which is what a group whose
    // aggregate bounds miss the rect costs. Its 12 items must still be
    // accounted for rather than silently dropping out of the delta.
    const delta = selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600), new Set([1]));

    expect(delta.visible).toBe(12);
    expect(delta.exited).toBe(12);
    expect(delta.stayed).toBe(12);
    expect(delta.entered).toBe(0);

    root.destroy();
    backend.destroy();
  });

  test('a rebuilt source starts the delta over rather than diffing against dead handles', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    addRow(root, 40, 100, 20);
    driveToSourceTier(root, backend);

    const source = root._retainedRootRepresentation().source!;
    const product = new DerivedRootProduct();

    product.rebind(source.scopes);
    selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600));
    product.rebind(source.scopes);

    const delta = selectDirectly(product, source.scopes, new Rectangle(0, 0, 800, 600));

    expect(delta.hadPrevious).toBe(false);
    expect(delta.exited).toBe(0);
    expect(delta.entered).toBe(delta.visible);

    root.destroy();
    backend.destroy();
  });

  test('a real camera step through the frame path reports a delta, not a full re-entry', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    addRow(root, 400, -2_000, 24);
    driveToSourceTier(root, backend, 400);

    backend.setView(viewAt(500));
    playFrame(root, backend);

    const delta = deltaOf(root);

    expect(delta.hadPrevious).toBe(true);
    expect(delta.stayed).toBeGreaterThan(delta.entered + delta.exited);
    expect(delta.candidates).toBeLessThan(root._retainedRootRepresentation().source!.itemCount);

    root.destroy();
    backend.destroy();
  });
});

describe('source visibility: a selection paints exactly what the cull rule admits', () => {
  test('a scrolling camera draws the items the reference scan admits, in recorded order', () => {
    const { backend, draws } = createBackend();
    const root = makeRoot(new Container());
    const leaves = addRow(root, 120, -600, 24);

    driveToSourceTier(root, backend, 400);

    const scope = rootScopeOf(root);
    const scan = new FlatScanVisibility();

    // Past `driveToSourceTier` the root's captures have been wasted twice, so
    // every further moving frame is a SUPPRESSED selection and culls against the
    // view's own rect. That is what makes the expected set computable here:
    // hand the reference rule the same rect and compare.
    for (const centerX of [400, 700, 1_000, 700, 400, 100]) {
      const view = viewAt(centerX);

      backend.setView(view);
      draws.length = 0;
      playFrame(root, backend);

      const rect = view.getBounds();
      const expected = admitted(scope, new Rectangle(rect.x, rect.y, rect.width, rect.height), scan).map(index => leaves[index]!.id);

      expect(draws).toEqual(expected);
      expect(draws.length).toBeGreaterThan(0);
    }

    root.destroy();
    backend.destroy();
  });
});

describe('source visibility: lifetime', () => {
  test('destroying the root releases the packed items, the index and the membership', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());

    addRow(root, 200, -1_000, 24);
    driveToSourceTier(root, backend, 400);

    const representation = root._retainedRootRepresentation();
    const source = representation.source!;
    const product = representation.derivedProduct!;

    expect(source.byteLength).toBeGreaterThan(0);
    expect(product.byteLength).toBeGreaterThan(0);

    representation.dispose();

    expect(source.byteLength).toBe(0);
    expect(product.byteLength).toBe(0);
    expect(source.rootScope).toBeNull();
    expect(source.itemCount).toBe(0);

    root.destroy();
    backend.destroy();
  });

  test('a content change drops the index and the membership rather than reusing them', () => {
    const { backend } = createBackend();
    const root = makeRoot(new Container());
    const leaves = addRow(root, 40, 100, 20);

    driveToSourceTier(root, backend, 400);

    const source = root._retainedRootRepresentation().source!;

    expect(source.itemCount).toBe(40);

    leaves[0]!.invalidateContent();
    backend.setView(viewAt(4_000));
    playFrame(root, backend);

    expect(source.rootScope).toBeNull();
    expect(source.byteLength).toBe(0);

    root.destroy();
    backend.destroy();
  });
});
