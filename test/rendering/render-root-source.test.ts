import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderEntryKind } from '#rendering/plan/renderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { LiveEntryReason, type SourceOther, type SourceScope } from '#rendering/plan/renderSourceItem';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { View } from '#rendering/View';

/**
 * The persistent source of a render ROOT: the items a view change re-selects
 * from instead of walking the scene graph again.
 *
 * Every test here is about one of two things - that a selection paints exactly
 * what a full collect of the same scene paints, and that the producers whose
 * semantics the source refuses to reimplement stay live re-dispatches at their
 * exact placement.
 */

class Leaf extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.setLocalBounds(0, 0, 16, 16);
  }
}

/** A container that counts how often the walk actually descended into it. */
class CountingContainer extends Container {
  public collects = 0;

  protected override _collectContent(builder: RenderPlanBuilder): void {
    this.collects++;
    super._collectContent(builder);
  }
}

/**
 * A producer whose output is a function of the camera - the `ImageLayerNode` /
 * `TileLayerNode` shape, reduced to the part that matters here: it reads
 * `builder.view` during collect, which is what the source observes.
 */
class ParallaxProducer extends Container {
  public lastViewCenterX = Number.NaN;
  public collects = 0;

  public constructor() {
    super();
    // Both real view-dependent nodes opt out of view culling - their coverage is
    // sized from the camera, so their bounds say nothing about whether they are
    // on screen. Without this the producer would be culled before it could read
    // the view at all.
    this.cullable = false;
  }

  protected override _collectContent(builder: RenderPlanBuilder): void {
    this.collects++;
    this.lastViewCenterX = builder.view.center.x;
    super._collectContent(builder);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true };

/**
 * File-local fake backend recording the drawables it is handed, in order.
 *
 * Deliberately WITHOUT the retained-capture hooks: the instruction-splice tier
 * needs them, and leaving them out keeps every clean frame on entry replay,
 * where the draws stay individually observable.
 */
const createDrawRecordingBackend = (): { backend: RenderBackend; draws: string[]; renderTarget: RenderTarget } => {
  const renderTarget = new RenderTarget(800, 600, true);
  const draws: string[] = [];

  const backend = {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    rendererRegistry: {
      resolve(drawable: Drawable) {
        if (drawable instanceof Leaf) {
          return flaggedRenderer;
        }

        throw new Error(`no renderer registered for ${drawable.constructor.name}`);
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
    draw(drawable: Drawable) {
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

  return { backend, draws, renderTarget };
};

/** Play one frame and return the drawables the backend was handed, in order. */
const playFrame = (root: RenderNode, backend: RenderBackend): number => {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(root, backend);

    RenderPlanOptimizer.optimize(plan);
    RenderPlanPlayer.play(plan, backend);

    return plan.nodeCount;
  } finally {
    RenderPlanBuilder.release(builder);
  }
};

const sourceOf = (root: RenderNode): RenderRootSource | null => root._retainedRootRepresentation().source;

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as { _fragment: RetainedGroupFragment })._fragment;

/**
 * One entry of the root scope in RECORDED order - the shape the source used to
 * hold as objects, rebuilt from the packed store so these tests keep asserting
 * order and kind rather than storage layout.
 */
type SourceEntryView = { readonly kind: RenderEntryKind.Draw; readonly drawable: Drawable; readonly seq: number } | SourceOther;

const scopeEntries = (scope: SourceScope): SourceEntryView[] => {
  const items = scope.items;
  const out: SourceEntryView[] = [];
  let other = 0;

  for (let i = 0; i < items.count; i++) {
    while (other < scope.others.length && scope.others[other]!.itemMark <= i) {
      out.push(scope.others[other]!);
      other++;
    }

    out.push({ kind: RenderEntryKind.Draw, drawable: items.drawables[i]!, seq: items.seq[i]! });
  }

  while (other < scope.others.length) {
    out.push(scope.others[other]!);
    other++;
  }

  return out;
};

/** The recorded entries of the scope the root's source holds for `node`. */
const entriesFor = (root: RenderNode, node: RenderNode): readonly SourceEntryView[] => {
  const scope = sourceOf(root)?.scopeOfNode(node) ?? null;

  if (scope === null) {
    throw new Error('the source holds no scope for this node');
  }

  return scopeEntries(scope);
};

const entriesOf = (root: RenderNode): readonly SourceEntryView[] => {
  const source = sourceOf(root);
  const rootScope = source?.rootScope ?? null;

  if (rootScope === null) {
    throw new Error('the root has no persistent source');
  }

  return scopeEntries(rootScope);
};

/** A view whose world rect is `[0,0 .. 800,600]`, matching the test render target. */
const viewAt = (centerX: number): View => new View(centerX, 300, 800, 600);

/**
 * A render root that is never culled as a whole.
 *
 * These tests are about which of the root's ITEMS a view admits, and a render
 * root that leaves the view entirely short-circuits that question before the
 * representation is ever consulted - the world container of a scrolling game
 * opts out for the same reason.
 */
const makeRoot = <T extends RenderNode>(root: T): T => {
  root.cullable = false;

  return root;
};

/**
 * Drive `root` to the tier where it selects from a persistent source, and leave
 * the camera back at its starting view.
 *
 * The build gate wants two consecutive rebuild frames that found the same
 * content, so the camera has to force a second rebuild before the discovery walk
 * happens. `viewAt(1000)` is far enough out that no view tolerance can hold -
 * every scene in this file sits around `x = 0..300`.
 */
const driveToSourceTier = (root: RenderNode, backend: RenderBackend): void => {
  backend.setView(viewAt(400));
  playFrame(root, backend); // rebuild #1

  backend.setView(viewAt(1000));
  playFrame(root, backend); // rebuild #2 -> discovery, then selection

  backend.setView(viewAt(400));
  playFrame(root, backend); // selection from the source
};

describe('render-root source: discovery', () => {
  test('the source is built only on the second rebuild that found the same content', () => {
    const { backend } = createDrawRecordingBackend();
    const root = makeRoot(new Container());

    root.addChild(new Leaf('a').setPosition(100, 300));
    backend.setView(viewAt(400));
    playFrame(root, backend);

    // One rebuild is not evidence of anything, and a source built for it would
    // be an O(N) walk plus a record per drawable that is never selected twice.
    expect(sourceOf(root)).toBeNull();

    backend.setView(viewAt(1000));
    playFrame(root, backend);

    expect(entriesOf(root)).toHaveLength(1);

    root.destroy();
    backend.destroy();
  });

  test('a scene whose content keeps changing never produces the streak the gate wants', () => {
    const { backend } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const leaf = new Leaf('a');

    leaf.setPosition(100, 300);
    root.addChild(leaf);

    // Every rebuild frame finds different content, so the gate never sees two in
    // a row over the same subtree - the alternating case a naive gate would pay
    // a full discovery walk for on every other frame.
    for (const centerX of [400, 1000, 400, 1000, 400]) {
      leaf.invalidateContent();
      backend.setView(viewAt(centerX));
      playFrame(root, backend);
    }

    expect(sourceOf(root)).toBeNull();

    root.destroy();
    backend.destroy();
  });

  test('a root whose camera never leaves the capture margin allocates no source at all', () => {
    const { backend } = createDrawRecordingBackend();
    const root = makeRoot(new Container());

    root.addChild(new Leaf('a').setPosition(100, 300));
    backend.setView(viewAt(400));

    playFrame(root, backend);
    playFrame(root, backend);
    // 2px stays inside the 50px capture margin: every frame replays.
    backend.setView(viewAt(402));
    playFrame(root, backend);

    expect(sourceOf(root)).toBeNull();

    root.destroy();
    backend.destroy();
  });

  test('discovery allocates no transform row for an item it only discovered', () => {
    const { backend } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const onScreen = new Leaf('a');
    const offScreen = new Leaf('b');

    onScreen.setPosition(100, 300);
    offScreen.setPosition(4000, 300); // never admitted by any view used here
    root.addChild(onScreen, offScreen);

    backend.setView(viewAt(400));
    playFrame(root, backend);

    // The discovery frame. Both items are found - the walk is culling-free by
    // construction, since an off-screen item is exactly the one that has to be
    // findable later - but this view admits neither, and `nodeCount` is the
    // frame's transform-row demand. A discovery walk that took the normal emit
    // path would report two rows for two draws that never happen.
    backend.setView(viewAt(1000));

    expect(playFrame(root, backend)).toBe(0);
    expect(entriesOf(root)).toHaveLength(2);

    // Selecting from those same two items now draws exactly the one on screen.
    backend.setView(viewAt(400));

    expect(playFrame(root, backend)).toBe(1);

    root.destroy();
    backend.destroy();
  });

  test('a content change drops the source rather than patching it', () => {
    const { backend } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const leaf = new Leaf('a');

    leaf.setPosition(100, 300);
    root.addChild(leaf);
    driveToSourceTier(root, backend);

    expect(entriesOf(root)).toHaveLength(1);

    leaf.invalidateContent();
    backend.setView(viewAt(1000));
    playFrame(root, backend);

    expect(sourceOf(root)?.isUsable(root._contentRevision, root._structureRevision, root._globalTransformStamp, root._transformRevision)).toBe(false);

    root.destroy();
    backend.destroy();
  });
});

describe('render-root source: stored bounds', () => {
  test('a moved item is selected on its CURRENT position, not on the extent it was discovered at', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const stays = new Leaf('stays');
    const moves = new Leaf('moves');

    stays.setPosition(100, 300);
    // Discovered far outside every view this test uses, so its STORED extent
    // says "not visible" for the rest of the run.
    moves.setPosition(4000, 300);
    root.addChild(stays, moves);

    driveToSourceTier(root, backend);
    draws.length = 0;
    backend.setView(viewAt(400));
    playFrame(root, backend);

    expect(draws).toEqual(['stays']);

    // A transform-only move. The item's identity, placement and producer are
    // all unchanged, so nothing about the ITEMS is wrong - but their stored
    // AABBs now describe where the drawables were, and selecting against those
    // would drop a node that just moved into view.
    moves.setPosition(140, 300);
    draws.length = 0;
    backend.setView(viewAt(410));
    playFrame(root, backend);

    expect(draws).toEqual(['stays', 'moves']);
    // The frame took the ordinary collect path and dropped the stale items,
    // rather than selecting from them. Not merely a safety fallback: a collect
    // over a moved subtree replays each container's unchanged drawables from its
    // own retained slot cache, which a live-bounds selection cannot do - it was
    // measured as the faster of the two, by a wide margin.
    expect(sourceOf(root)?.isUsable(root._contentRevision, root._structureRevision, root._globalTransformStamp, root._transformRevision)).toBe(false);

    root.destroy();
    backend.destroy();
  });

  test('an item whose cullArea is mutated in place is judged by the mutated rect', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const leaf = new Leaf('a');
    // Replacing the reference stamps structure dirty; MUTATING the rectangle
    // stamps nothing, so this is the one input a selection can never cache.
    const area = new Rectangle(4000, 300, 16, 16);

    leaf.setPosition(100, 300);
    leaf.cullArea = area;
    root.addChild(leaf);

    driveToSourceTier(root, backend);
    draws.length = 0;
    backend.setView(viewAt(400));
    playFrame(root, backend);

    expect(draws).toEqual([]);

    area.setPosition(100, 300);
    draws.length = 0;
    backend.setView(viewAt(410));
    playFrame(root, backend);

    expect(draws).toEqual(['a']);

    root.destroy();
    backend.destroy();
  });
});

describe('render-root source: draw order', () => {
  test('an item entering the view is materialised at its stored (zIndex, seq), not appended', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const first = new Leaf('a');
    const entering = new Leaf('b');
    const last = new Leaf('c');

    // `b` is the middle child by document order, so its seq places it between
    // the two others - but it starts outside every cull rect used below.
    first.setPosition(100, 300);
    entering.setPosition(860, 300);
    last.setPosition(120, 300);
    root.addChild(first, entering, last);

    driveToSourceTier(root, backend);
    draws.length = 0;
    backend.setView(viewAt(400));
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'c']);

    // Pan right by 60: past the capture margin, so this is a selection frame,
    // and far enough that `b` is admitted while `a` and `c` still are.
    draws.length = 0;
    backend.setView(viewAt(460));
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'b', 'c']);

    // Same scene, same view, collected from the scene graph: identical order.
    const control = makeRoot(new Container());

    control.addChild(new Leaf('a').setPosition(100, 300), new Leaf('b').setPosition(860, 300), new Leaf('c').setPosition(120, 300));

    draws.length = 0;
    playFrame(control, backend);

    expect(draws).toEqual(['a', 'b', 'c']);

    root.destroy();
    control.destroy();
    backend.destroy();
  });

  test('a selection re-enters a group under the same subtree cull a full collect applies', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const near = new CountingContainer();
    const far = new CountingContainer();

    near.addChild(new Leaf('near').setPosition(100, 300));
    far.addChild(new Leaf('far').setPosition(4000, 300));
    root.addChild(near, far);

    driveToSourceTier(root, backend);

    const farCollects = far.collects;

    draws.length = 0;
    backend.setView(viewAt(200));
    playFrame(root, backend);

    expect(draws).toEqual(['near']);
    // The selection skipped the whole far group on its aggregate bounds instead
    // of scanning its items, exactly as `SceneNode.collect` would have.
    expect(far.collects).toBe(farCollects);

    root.destroy();
    backend.destroy();
  });
});

describe('render-root source: producer-local view attribution', () => {
  test('one view-dependent producer costs one live entry, not the whole root', () => {
    const { backend } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const before = new Leaf('a');
    const parallax = new ParallaxProducer();
    const after = new Leaf('b');

    before.setPosition(100, 300);
    after.setPosition(140, 300);
    parallax.addChild(new Leaf('p').setPosition(120, 300));
    root.addChild(before, parallax, after);

    driveToSourceTier(root, backend);

    const entries = entriesOf(root);

    expect(entries).toHaveLength(3);
    expect(entries[0]!.kind).toBe(RenderEntryKind.Draw);
    expect(entries[2]!.kind).toBe(RenderEntryKind.Draw);

    const live = entries[1]!;

    expect(live.kind).toBe(RenderEntryKind.Barrier);

    if (live.kind === RenderEntryKind.Barrier) {
      expect(live.reason).toBe(LiveEntryReason.ViewDependent);
      expect(live.node).toBe(parallax);
      expect(live.seq).toBe(1);
    }

    // A root-wide fallback would have left no persistent item at all.
    expect(entries.filter(entry => entry.kind === RenderEntryKind.Draw)).toHaveLength(2);

    root.destroy();
    backend.destroy();
  });

  test('the live producer re-collects under the moved camera instead of replaying frozen coverage', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const parallax = new ParallaxProducer();

    parallax.addChild(new Leaf('p').setPosition(120, 300));
    root.addChild(new Leaf('a').setPosition(100, 300), parallax);

    driveToSourceTier(root, backend);

    draws.length = 0;
    backend.setView(viewAt(200));
    playFrame(root, backend);

    expect(parallax.lastViewCenterX).toBe(200);
    expect(draws).toContain('p');

    backend.setView(viewAt(600));
    playFrame(root, backend);

    expect(parallax.lastViewCenterX).toBe(600);

    root.destroy();
    backend.destroy();
  });
});

describe('render-root source: boundaries the source refuses to rebuild', () => {
  test('a transform-group boundary is one live entry and its descendants are not source items', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new RetainedContainer();
    const before = new Leaf('a');
    const after = new Leaf('b');

    before.setPosition(100, 300);
    after.setPosition(180, 300);
    group.addChild(new Leaf('g1'), new Leaf('g2'));
    group.setPosition(140, 300);
    root.addChild(before, group, after);

    driveToSourceTier(root, backend);

    const entries = entriesOf(root);

    expect(entries).toHaveLength(3);
    expect(entries.map(entry => entry.kind)).toEqual([RenderEntryKind.Draw, RenderEntryKind.Barrier, RenderEntryKind.Draw]);

    const live = entries[1]!;

    if (live.kind === RenderEntryKind.Barrier) {
      expect(live.reason).toBe(LiveEntryReason.Boundary);
      expect(live.node).toBe(group);
      expect(live.seq).toBe(1);
    }

    // No double ownership: the group's own children never became root items.
    expect(entries.filter(entry => entry.kind === RenderEntryKind.Draw)).toHaveLength(2);

    draws.length = 0;
    backend.setView(viewAt(200));
    playFrame(root, backend);

    // The boundary still paints, and still paints between its siblings.
    expect(draws).toEqual(['a', 'g1', 'g2', 'b']);

    root.destroy();
    backend.destroy();
  });

  test('a barrier-effect producer is one live entry and its subtree is not flattened', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const clipped = new Container();

    clipped.clip = true;
    clipped.addChild(new Leaf('c1').setPosition(140, 300));
    root.addChild(new Leaf('a').setPosition(100, 300), clipped, new Leaf('b').setPosition(180, 300));

    driveToSourceTier(root, backend);

    const entries = entriesOf(root);

    expect(entries.map(entry => entry.kind)).toEqual([RenderEntryKind.Draw, RenderEntryKind.Barrier, RenderEntryKind.Draw]);

    const live = entries[1]!;

    if (live.kind === RenderEntryKind.Barrier) {
      expect(live.reason).toBe(LiveEntryReason.Barrier);
      expect(live.node).toBe(clipped);
    }

    draws.length = 0;
    backend.setView(viewAt(200));
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'c1', 'b']);

    root.destroy();
    backend.destroy();
  });

  test('a root that IS a transform-group boundary keeps its own tier and builds no self-entry', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new RetainedContainer());

    root.addChild(new Leaf('a').setPosition(100, 300), new Leaf('b').setPosition(140, 300));

    // The group tier already owns this scope; wrapping a root representation
    // around it would have it fight the group over the same record target.
    expect(root._supportsRootRetention()).toBe(false);

    backend.setView(viewAt(400));
    playFrame(root, backend);
    playFrame(root, backend);
    backend.setView(viewAt(200));
    playFrame(root, backend);
    backend.setView(viewAt(400));

    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'b']);
    expect(sourceOf(root)).toBeNull();

    root.destroy();
    backend.destroy();
  });
});

describe('render-root source: a transform group pays for none of the root machinery', () => {
  /**
   * The two tiers share their capture layer - the pooled records, the thrash
   * rule, the transform-row reconcile - and share nothing above it. A source is
   * a spatial index plus one packed item per drawable, built so a MOVED CAMERA
   * can re-select what it admits; inside a transform group there is no such
   * question to answer, because `RenderNode._collectForRenderPlan` suppresses
   * per-child culling at the boundary and the group is culled as a whole.
   *
   * So a group would pay the walk, the item store and the index for a selection
   * that can only ever return everything, and would trade its own O(batches)
   * replay for an O(items) emit. These tests exist to make that stay a decision
   * rather than an omission.
   */
  test('a group under a selecting root builds no source, no membership and no representation of its own', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new RetainedContainer();
    const inside = new Leaf('g1');

    inside.setPosition(140, 300);
    group.addChild(inside);
    root.addChild(new Leaf('a').setPosition(100, 300), group);

    driveToSourceTier(root, backend);

    // The root reached the tier this is all about...
    expect(sourceOf(root)).not.toBeNull();

    // ...and the group under it holds none of it. Read through the private
    // field rather than `_retainedRootRepresentation()`, which would CREATE the
    // very thing being asserted absent.
    const groupRoot = (group as unknown as { _retainedRoot: unknown })._retainedRoot;

    expect(groupRoot).toBeNull();

    // Its own tier still carries it across camera steps: the group fragment's
    // key omits `View.updateId` on purpose - the group is culled as a whole, so
    // its capture is view-independent - and that is exactly what a root-style
    // per-child re-selection inside the group would take away.
    const captureSpy = vi.spyOn(fragmentOf(group), 'capture');

    for (const centerX of [420, 440, 460, 380]) {
      draws.length = 0;
      backend.setView(viewAt(centerX));
      playFrame(root, backend);

      expect(draws).toEqual(['a', 'g1']);
    }

    expect(captureSpy).not.toHaveBeenCalled();
    expect((group as unknown as { _retainedRoot: unknown })._retainedRoot).toBeNull();

    captureSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });

  test('moving the group is one matrix: the root source survives it and the group re-collects nothing', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new RetainedContainer();
    const inside = new Leaf('g1');

    group.addChild(inside);
    group.setPosition(140, 300);
    root.addChild(new Leaf('a').setPosition(100, 300), group);

    driveToSourceTier(root, backend);

    const source = sourceOf(root);

    expect(source).not.toBeNull();

    const captureSpy = vi.spyOn(fragmentOf(group), 'capture');

    group.setPosition(160, 300);
    draws.length = 0;
    playFrame(root, backend);

    // A group move stamps no revision inside the group, so its fragment stays
    // clean; and the group is a live entry in the root's source rather than a
    // set of items, so the root's stored world bounds do not describe it and
    // its move cannot invalidate them.
    expect(draws).toEqual(['a', 'g1']);
    expect(captureSpy).not.toHaveBeenCalled();
    expect(sourceOf(root)).toBe(source);

    captureSpy.mockRestore();
    root.destroy();
    backend.destroy();
  });
});

/**
 * A structural change used to withdraw the whole persistent representation: the
 * items are keyed on the structure revision, and the build gate wants two
 * consecutive frames that found the subtree unchanged - which a scene adding and
 * removing nodes every frame never produces. Every such frame therefore fell
 * back to a full collect over every node.
 *
 * These tests pin the two halves of the replacement: that a change is
 * re-discovered where it happened and nowhere else, and that the frame it
 * produces is still exactly the frame a full collect produces.
 */
describe('render-root source: structure delta', () => {
  test('an added child is re-discovered in its own container and nowhere else', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const left = new CountingContainer();
    const right = new CountingContainer();

    left.addChild(new Leaf('a').setPosition(10, 300));
    right.addChild(new Leaf('b').setPosition(60, 300));
    root.addChild(left, right);

    driveToSourceTier(root, backend);

    const walkedLeft = left.collects;
    const walkedRight = right.collects;

    right.addChild(new Leaf('c').setPosition(110, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'b', 'c']);
    // The whole point: the container that did not change is not walked again,
    // so its items, its index and its membership stay where they are.
    expect(left.collects).toBe(walkedLeft);
    expect(right.collects).toBe(walkedRight + 1);
    expect(entriesFor(root, right)).toHaveLength(2);

    root.destroy();
    backend.destroy();
  });

  test('a removed child leaves the source describing exactly what is left', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new CountingContainer();
    const removed = new Leaf('b').setPosition(60, 300);

    group.addChild(new Leaf('a').setPosition(10, 300), removed, new Leaf('c').setPosition(110, 300));
    root.addChild(group);

    driveToSourceTier(root, backend);

    removed.destroy();
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'c']);
    expect(entriesFor(root, group)).toHaveLength(2);

    root.destroy();
    backend.destroy();
  });

  test('a root that churns every frame earns a source it can splice', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new CountingContainer();

    group.addChild(new Leaf('a').setPosition(10, 300));
    root.addChild(group);
    backend.setView(viewAt(400));

    let replaced = group.children[0] as Leaf;

    // The camera never moves, so the ordinary build gate - two rebuild frames
    // that found the same content - can never fire here. Structural churn is
    // what earns the source.
    for (let frame = 0; frame < 4; frame++) {
      playFrame(root, backend);
      replaced.destroy();
      replaced = new Leaf(`a${frame}`);
      replaced.setPosition(10, 300);
      group.addChild(replaced);
    }

    expect(sourceOf(root)).not.toBeNull();

    const walked = group.collects;

    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a3']);
    // One re-discovery of the changed container, not a collect of the root.
    expect(group.collects).toBe(walked + 1);

    root.destroy();
    backend.destroy();
  });

  test('a nested container changed alongside its parent is re-discovered once', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const outer = new CountingContainer();
    const inner = new CountingContainer();

    inner.addChild(new Leaf('i1').setPosition(10, 300));
    outer.addChild(inner, new Leaf('o1').setPosition(60, 300));
    root.addChild(outer);

    driveToSourceTier(root, backend);

    const walkedInner = inner.collects;

    // Both containers changed, and the outer one encloses the inner: without
    // pruning the nested subtree is walked twice, once on its own and once
    // inside the ancestor's discovery, and the first result is then discarded.
    inner.addChild(new Leaf('i2').setPosition(110, 300));
    outer.addChild(new Leaf('o2').setPosition(160, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['i1', 'i2', 'o1', 'o2']);
    expect(inner.collects).toBe(walkedInner + 1);

    root.destroy();
    backend.destroy();
  });

  test('an item that moved inside a re-discovered container is stored where it is now', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new Container();
    const moved = new Leaf('a');

    moved.setPosition(10, 300);
    group.addChild(moved, new Leaf('b').setPosition(60, 300));
    root.addChild(group);

    driveToSourceTier(root, backend);

    // Inside the container the delta re-discovers, so the move is covered: the
    // item's stored world bounds are re-read, and the far-off item is culled by
    // the same rect a full collect would cull it with.
    moved.setPosition(9000, 300);
    group.addChild(new Leaf('c').setPosition(110, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['b', 'c']);

    root.destroy();
    backend.destroy();
  });

  test('a move to an item the delta would keep refuses the delta', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const left = new CountingContainer();
    const right = new CountingContainer();
    const moved = new Leaf('a');

    moved.setPosition(10, 300);
    left.addChild(moved);
    right.addChild(new Leaf('b').setPosition(60, 300));
    root.addChild(left, right);

    driveToSourceTier(root, backend);

    const walkedLeft = left.collects;

    // A structural change the delta could absorb, plus a move to an item it
    // would have kept: that item's stored world bounds and its written GPU rows
    // are both stale, and neither is repairable from a re-discovery of the
    // OTHER container.
    moved.setPosition(200, 300);
    right.addChild(new Leaf('c').setPosition(110, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'b', 'c']);
    expect(left.collects).toBeGreaterThan(walkedLeft);

    root.destroy();
    backend.destroy();
  });

  test('a spliced source paints what a full collect of the same scene paints', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const outer = new CountingContainer();
    const inner = new Container();
    const untouched = new CountingContainer();

    inner.addChild(new Leaf('i1').setPosition(10, 300), new Leaf('i2').setPosition(40, 300));
    outer.addChild(new Leaf('o1').setPosition(70, 300), inner, new Leaf('o2').setPosition(100, 300));
    untouched.addChild(new Leaf('u1').setPosition(160, 300));
    root.addChild(outer, untouched);

    driveToSourceTier(root, backend);

    const walkedUntouched = untouched.collects;

    inner.addChild(new Leaf('i3').setPosition(130, 300));
    outer.removeChild(outer.children[0]!);
    draws.length = 0;
    playFrame(root, backend);

    const spliced = [...draws];

    // Proof this frame took the delta rather than a rebuild: the container
    // neither change touched was not walked again.
    expect(untouched.collects).toBe(walkedUntouched);

    root.destroy();

    // The same scene built from scratch, so its first frame is a plain collect:
    // the order it paints is the answer the spliced source has to reproduce.
    const rebuilt = makeRoot(new Container());
    const rebuiltOuter = new Container();
    const rebuiltInner = new Container();
    const rebuiltUntouched = new Container();

    rebuiltInner.addChild(new Leaf('i1').setPosition(10, 300), new Leaf('i2').setPosition(40, 300), new Leaf('i3').setPosition(130, 300));
    rebuiltOuter.addChild(rebuiltInner, new Leaf('o2').setPosition(100, 300));
    rebuiltUntouched.addChild(new Leaf('u1').setPosition(160, 300));
    rebuilt.addChild(rebuiltOuter, rebuiltUntouched);

    draws.length = 0;
    playFrame(rebuilt, backend);

    expect(spliced).toEqual(draws);

    rebuilt.destroy();
    backend.destroy();
  });
});

describe('render-root source: item-granular re-derivation', () => {
  class CountingLeaf extends Leaf {
    public collects = 0;

    protected override _collectContent(builder: RenderPlanBuilder): void {
      this.collects++;
      super._collectContent(builder);
    }
  }

  class ToggleReader extends Container {
    public reads = false;

    public constructor() {
      super();
      this.cullable = false;
    }

    protected override _collectContent(builder: RenderPlanBuilder): void {
      if (this.reads) {
        void builder.view.center.x;
      }

      super._collectContent(builder);
    }
  }

  test('a churned container collects its arrivals and nothing it already holds', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new Container();
    const a = new CountingLeaf('a').setPosition(10, 300);
    const b = new CountingLeaf('b').setPosition(60, 300);
    const c = new CountingLeaf('c').setPosition(110, 300);

    group.addChild(a, b, c);
    root.addChild(group);

    driveToSourceTier(root, backend);

    const walkedA = a.collects;
    const walkedC = c.collects;
    const d = new CountingLeaf('d').setPosition(160, 300);

    b.destroy();
    group.addChild(d);
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'c', 'd']);
    expect(a.collects).toBe(walkedA);
    expect(c.collects).toBe(walkedC);
    expect(d.collects).toBe(1);
    expect(entriesFor(root, group).map(entry => (entry.kind === RenderEntryKind.Draw ? entry.drawable : null))).toEqual([a, c, d]);

    root.destroy();
    backend.destroy();
  });

  test('a nested container the change did not touch is carried without a walk', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new Container();
    const nested = new CountingContainer();

    nested.addChild(new Leaf('n1').setPosition(10, 300), new Leaf('n2').setPosition(40, 300));
    group.addChild(new Leaf('a').setPosition(70, 300), nested, new Leaf('b').setPosition(100, 300));
    root.addChild(group);

    driveToSourceTier(root, backend);

    const walkedNested = nested.collects;
    const before = entriesFor(root, nested);

    group.addChild(new Leaf('c').setPosition(130, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'n1', 'n2', 'b', 'c']);
    expect(nested.collects).toBe(walkedNested);
    expect(entriesFor(root, nested)).toEqual(before);

    root.destroy();
    backend.destroy();
  });

  test('a nested container that moved is walked again, so its items land where it is now', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new Container();
    const nested = new CountingContainer();

    nested.addChild(new Leaf('n1').setPosition(10, 300));
    group.addChild(new Leaf('a').setPosition(70, 300), nested);
    root.addChild(group);

    driveToSourceTier(root, backend);

    const walkedNested = nested.collects;

    nested.setPosition(9000, 0);
    group.addChild(new Leaf('b').setPosition(100, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'b']);
    expect(nested.collects).toBe(walkedNested + 1);

    root.destroy();
    backend.destroy();
  });

  test('an item moved between containers is stored in the container that holds it now', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const left = new Container();
    const right = new Container();
    const moved = new Leaf('x').setPosition(10, 300);

    left.addChild(moved, new Leaf('a').setPosition(40, 300));
    right.addChild(new Leaf('b').setPosition(70, 300));
    root.addChild(left, right);

    driveToSourceTier(root, backend);

    right.addChild(moved);
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'b', 'x']);
    expect(entriesFor(root, left).map(entry => (entry.kind === RenderEntryKind.Draw ? (entry.drawable as Leaf).id : null))).toEqual(['a']);
    expect(entriesFor(root, right).map(entry => (entry.kind === RenderEntryKind.Draw ? (entry.drawable as Leaf).id : null))).toEqual(['b', 'x']);

    root.destroy();
    backend.destroy();
  });

  test('a reorder is carried in the new order without collecting anything', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new Container();
    const a = new CountingLeaf('a').setPosition(10, 300);
    const b = new CountingLeaf('b').setPosition(40, 300);
    const c = new CountingLeaf('c').setPosition(70, 300);

    group.addChild(a, b, c);
    root.addChild(group);

    driveToSourceTier(root, backend);

    const walked = a.collects + b.collects + c.collects;

    group.setChildIndex(c, 0);
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['c', 'a', 'b']);
    expect(a.collects + b.collects + c.collects).toBe(walked);

    root.destroy();
    backend.destroy();
  });

  test('a nested container that starts reading the view is rebuilt as a live entry', () => {
    const { backend, draws } = createDrawRecordingBackend();
    const root = makeRoot(new Container());
    const group = new Container();
    const reader = new ToggleReader();

    reader.addChild(new Leaf('r1').setPosition(10, 300));
    group.addChild(new Leaf('a').setPosition(40, 300), reader);
    root.addChild(group);

    driveToSourceTier(root, backend);

    expect(entriesFor(root, group).some(entry => entry.kind === RenderEntryKind.Group && entry.node === reader)).toBe(true);

    reader.reads = true;
    reader.addChild(new Leaf('r2').setPosition(70, 300));
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'r1', 'r2']);

    // The refused delta dropped the source; the next stable frames earn it back
    // with the reader as a live entry.
    backend.setView(viewAt(1000));
    playFrame(root, backend);
    backend.setView(viewAt(400));
    playFrame(root, backend);
    draws.length = 0;
    playFrame(root, backend);

    expect(draws).toEqual(['a', 'r1', 'r2']);
    expect(entriesFor(root, group).some(entry => entry.kind === RenderEntryKind.Barrier && entry.node === reader)).toBe(true);

    root.destroy();
    backend.destroy();
  });
});
