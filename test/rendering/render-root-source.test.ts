import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { LiveEntryReason, type SourceEntry } from '#rendering/plan/RenderSourceItem';
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
 * Every test here is about one of two things — that a selection paints exactly
 * what a full collect of the same scene paints, and that the producers whose
 * semantics the source refuses to reimplement stay live re-dispatches at their
 * exact placement.
 */

class Leaf extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this._setLocalBounds(0, 0, 16, 16);
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
 * A producer whose output is a function of the camera — the `ImageLayerNode` /
 * `TileLayerNode` shape, reduced to the part that matters here: it reads
 * `builder.view` during collect, which is what the source observes.
 */
class ParallaxProducer extends Container {
  public lastViewCenterX = Number.NaN;
  public collects = 0;

  public constructor() {
    super();
    // Both real view-dependent nodes opt out of view culling — their coverage is
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

const entriesOf = (root: RenderNode): readonly SourceEntry[] => {
  const source = sourceOf(root);

  if (source === null) {
    throw new Error('the root has no persistent source');
  }

  return source.entries;
};

/** A view whose world rect is `[0,0 .. 800,600]`, matching the test render target. */
const viewAt = (centerX: number): View => new View(centerX, 300, 800, 600);

/**
 * A render root that is never culled as a whole.
 *
 * These tests are about which of the root's ITEMS a view admits, and a render
 * root that leaves the view entirely short-circuits that question before the
 * representation is ever consulted — the world container of a scrolling game
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
 * happens. `viewAt(1000)` is far enough out that no view tolerance can hold —
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
    // a row over the same subtree — the alternating case a naive gate would pay
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

    // The discovery frame. Both items are found — the walk is culling-free by
    // construction, since an off-screen item is exactly the one that has to be
    // findable later — but this view admits neither, and `nodeCount` is the
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
    // all unchanged, so nothing about the ITEMS is wrong — but their stored
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
    // own retained slot cache, which a live-bounds selection cannot do — it was
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
    // the two others — but it starts outside every cull rect used below.
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
    // of scanning its items, exactly as `SceneNode._collect` would have.
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
