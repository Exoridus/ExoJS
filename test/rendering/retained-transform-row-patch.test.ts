import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import {
  type RetainedBatchInstruction,
  type RetainedGroupBundle,
  RetainedInstructionKind,
  type RetainedInstructionSet,
} from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { View } from '#rendering/View';

/**
 * In-place transform-row patching, shared by `RetainedContainer` and the
 * automatic render-root representation: a moved node's baked row is rewritten
 * (O(k)) instead of the whole product being re-derived.
 */

class RecordableLeaf extends Drawable {
  public constructor(public readonly id = '') {
    super();
    this._setLocalBounds(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true };

interface PatchCall {
  readonly localRow: number;
}

interface TintPatchCall {
  readonly localRow: number;
  readonly rgba: readonly number[];
}

interface Harness {
  readonly backend: RenderBackend;
  readonly events: string[];
  readonly patches: PatchCall[];
  readonly tintPatches: TintPatchCall[];
}

// File-local fake backend (repo convention keeps test harnesses file-local). It
// hands every capture a bundle that supports the in-place row patch and records
// which group-local row each patch addressed.
const createPatchingBackend = (): Harness => {
  const renderTarget = new RenderTarget(800, 600, true);
  const events: string[] = [];
  const patches: PatchCall[] = [];
  const tintPatches: TintPatchCall[] = [];
  const pending: string[] = [];
  const activeCaptures: RetainedInstructionSet[] = [];

  const bundle: RetainedGroupBundle = {
    generation: 1,
    transformRowBase: 0,
    _patchTransformRow(localRow: number): void {
      patches.push({ localRow });
    },
    _patchTintRow(localRow: number, bytes: Uint8Array): void {
      tintPatches.push({ localRow, rgba: [...bytes] });
    },
  };

  const flushPending = (): void => {
    if (pending.length === 0) {
      return;
    }

    const ids = pending.slice();

    pending.length = 0;
    events.push(`flush:${ids.join(',')}`);

    if (activeCaptures.length > 0) {
      const batch: RetainedBatchInstruction = {
        kind: RetainedInstructionKind.Batch,
        bundle,
        generation: bundle.generation,
        instanceCount: ids.length,
        drawCalls: 1,
        payload: { ids },
      };

      for (const set of activeCaptures) {
        set.append(batch);
      }
    }
  };

  const backend = {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    rendererRegistry: {
      resolve(drawable: Drawable) {
        if (drawable instanceof RecordableLeaf) {
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
      pending.push((drawable as RecordableLeaf).id);

      return backend;
    },
    execute() {
      return backend;
    },
    flush() {
      flushPending();

      return backend;
    },
    destroy() {
      renderTarget.destroy();
    },
    _endDrawPlan(): void {
      flushPending();
    },
    _setRenderGroupTransform(): void {
      flushPending(); // groups are flush boundaries (hook contract)
    },
    _beginRetainedCapture(set: RetainedInstructionSet): void {
      flushPending();
      set.ownedBundle = bundle;
      activeCaptures.push(set);
    },
    _endRetainedCapture(set: RetainedInstructionSet): void {
      flushPending();

      const index = activeCaptures.lastIndexOf(set);

      if (index !== -1) {
        activeCaptures.splice(index, 1);
      }
    },
    _replayRetainedBatch(batch: RetainedBatchInstruction): void {
      flushPending();
      events.push(`replay:${(batch.payload as { ids: readonly string[] }).ids.join(',')}`);
    },
  } as unknown as RenderBackend;

  return { backend, events, patches, tintPatches };
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

/** Run the ladder to the splice tier: dirty collect, record frame, first splice. */
const reachSpliceTier = (root: RenderNode, harness: Harness): void => {
  playFrame(root, harness.backend);
  playFrame(root, harness.backend);
  playFrame(root, harness.backend);
  harness.events.length = 0;
  harness.patches.length = 0;
  harness.tintPatches.length = 0;
};

describe('recorded row base spans nested draws', () => {
  test('a group whose first child is a plain container patches the moved child at its true store row', () => {
    // The backend rebases the group's rows by the minimum node index over ALL
    // recorded batches, so the nested leaf's row 0 is the base. A base taken over
    // top-level draw records only would report 1 here and patch row 0 - the
    // nested leaf would jump to `direct`'s transform and `direct` would freeze.
    const harness = createPatchingBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const inner = new Container();

    inner.addChild(new RecordableLeaf('nested')); // node index 0
    group.addChild(inner);

    const direct = new RecordableLeaf('direct'); // node index 1

    group.addChild(direct);
    root.addChild(group);

    reachSpliceTier(root, harness);

    direct.setPosition(40, 40);
    playFrame(root, harness.backend);

    expect(harness.patches).toEqual([{ localRow: 1 }]);
    expect(harness.events).toContain('replay:nested,direct'); // still spliced

    root.destroy();
    harness.backend.destroy();
  });
});

describe('automatic render-root representation: incremental transform rows', () => {
  test('a nested descendant move patches one row and keeps the splice', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const mid = new Container();
    const leaf = new RecordableLeaf('a');

    mid.addChild(leaf);
    root.addChild(mid);

    reachSpliceTier(root, harness);

    leaf.setPosition(24, 24);
    playFrame(root, harness.backend);

    expect(harness.patches).toEqual([{ localRow: 0 }]);
    expect(harness.events).toEqual(['replay:a']);

    root.destroy();
    harness.backend.destroy();
  });

  test('k moves cost k patches, not a re-collect', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const leaves = [new RecordableLeaf('a'), new RecordableLeaf('b'), new RecordableLeaf('c')];

    root.addChild(...leaves);
    reachSpliceTier(root, harness);

    leaves[0]!.setPosition(1, 1);
    leaves[2]!.setPosition(3, 3);
    playFrame(root, harness.backend);

    expect(harness.patches).toEqual([{ localRow: 0 }, { localRow: 2 }]);
    expect(harness.events).toEqual(['replay:a,b,c']);

    root.destroy();
    harness.backend.destroy();
  });

  test('the same node moved twice between frames is patched once (queue dedup)', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    reachSpliceTier(root, harness);

    leaf.setPosition(1, 1);
    leaf.setPosition(2, 2);
    playFrame(root, harness.backend);

    expect(harness.patches).toEqual([{ localRow: 0 }]);

    root.destroy();
    harness.backend.destroy();
  });

  test('a capture that culled something still patches a RECORDED node that moves', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const visible = new RecordableLeaf('a');
    const offscreen = new RecordableLeaf('b');

    visible.setPosition(400, 300);
    offscreen.setPosition(5000, 5000);
    root.addChild(visible, offscreen);
    harness.backend.setView(new View(400, 300, 800, 600));

    reachSpliceTier(root, harness);

    visible.setPosition(410, 300);
    playFrame(root, harness.backend);

    // The moved node is in the product, so its row is patchable; the culled one
    // is irrelevant to this move. Off-screen content no longer costs the whole
    // subtree its recorded tier.
    expect(harness.patches).toHaveLength(1);
    expect(harness.events).not.toContain('flush:a');

    root.destroy();
    harness.backend.destroy();
  });

  test('a node the capture culled cannot be patched when it moves — the frame re-collects and draws it', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const visible = new RecordableLeaf('a');
    const offscreen = new RecordableLeaf('b');

    visible.setPosition(400, 300);
    offscreen.setPosition(5000, 5000);
    root.addChild(visible, offscreen);
    harness.backend.setView(new View(400, 300, 800, 600));

    reachSpliceTier(root, harness);

    // The one direction the capture rect cannot answer: a node that is in NO
    // record moves into the view. There is no row to patch and nothing in the
    // product points at it, so the frame must fall back to a real collect.
    harness.events.length = 0;
    offscreen.setPosition(400, 300);
    playFrame(root, harness.backend);

    expect(harness.patches).toEqual([]);
    expect(harness.events).toContain('flush:a,b');

    root.destroy();
    harness.backend.destroy();
  });

  test('a moved node that leaves the view replays clipped instead of forcing a re-collect', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const anchor = new RecordableLeaf('a');
    const leaver = new RecordableLeaf('b');

    // `anchor` keeps the ROOT itself inside the view; without it the root's own
    // bounds would follow the leaver off-screen and the whole subtree would be
    // culled, which is a different thing than the case under test.
    anchor.setPosition(400, 300);
    leaver.setPosition(420, 300);
    root.addChild(anchor, leaver);
    harness.backend.setView(new View(400, 300, 800, 600));

    reachSpliceTier(root, harness);

    leaver.setPosition(5000, 5000);
    playFrame(root, harness.backend);

    // Drawing a node that has left the view is not a pixel error - it lands
    // outside the viewport and is clipped - so the cheap answer is the correct
    // one: patch the row and keep replaying.
    expect(harness.patches).toHaveLength(1);
    expect(harness.events).toContain('replay:a,b');

    root.destroy();
    harness.backend.destroy();
  });

  test('a scene that moves every frame still reaches the recorded tier', () => {
    // The bootstrap case, and the reason the root queues moves from the CAPTURE
    // onward rather than from the recording: a move between every pair of frames
    // must not keep the root off the record-arming tier forever.
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);

    playFrame(root, harness.backend); // F1: capture
    leaf.setPosition(1, 1);
    playFrame(root, harness.backend); // F2: entry replay + arm -> recorded
    leaf.setPosition(2, 2);
    harness.events.length = 0;
    playFrame(root, harness.backend); // F3: patch + splice

    expect(harness.patches).toEqual([{ localRow: 0 }]);
    expect(harness.events).toEqual(['replay:a']);

    root.destroy();
    harness.backend.destroy();
  });

  test('a move on the entry-replay tier refreshes the record AABB the optimizer reorders on', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    playFrame(root, harness.backend); // capture only: nothing baked yet

    leaf.setPosition(100, 100);
    playFrame(root, harness.backend);

    const record = root._retainedRootRepresentation().fragment.recordedDraw(leaf);

    expect(record?.minX).toBe(100);
    expect(record?.maxX).toBe(116);
    expect(harness.patches).toEqual([]); // live transforms, nothing to patch

    root.destroy();
    harness.backend.destroy();
  });

  test('a content change still invalidates — patching is the transform channel only', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    reachSpliceTier(root, harness);

    leaf.invalidateContent();
    playFrame(root, harness.backend);

    expect(harness.patches).toEqual([]);
    expect(harness.events).toContain('flush:a');

    root.destroy();
    harness.backend.destroy();
  });

  test('overlapping roots both receive the move', () => {
    const harness = createPatchingBackend();
    const world = new Container();
    const hud = new Container();
    const leaf = new RecordableLeaf('a');

    hud.addChild(leaf);
    world.addChild(hud);

    reachSpliceTier(world, harness);
    reachSpliceTier(hud, harness);

    leaf.setPosition(9, 9);

    // Both representations hold a recording, so both queued the move: each frame
    // patches its own copy of the row rather than re-collecting.
    playFrame(world, harness.backend);
    expect(harness.patches).toHaveLength(1);

    playFrame(hud, harness.backend);
    expect(harness.patches).toHaveLength(2);

    world.destroy();
    harness.backend.destroy();
  });
});

describe('automatic render-root representation: incremental tint rows', () => {
  test('a tint change rewrites one row and keeps the recording', () => {
    // The change this exists for: a tint written every frame - a hit flash, a
    // selection highlight, a fade - used to throw the whole recorded product
    // away on every frame it happened.
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    reachSpliceTier(root, harness);

    harness.events.length = 0;
    leaf.setTint(new Color(255, 0, 0, 0.5));
    playFrame(root, harness.backend);

    expect(harness.tintPatches).toEqual([{ localRow: 0, rgba: [255, 0, 0, 128] }]);
    expect(harness.patches).toEqual([]); // nothing moved
    expect(harness.events).toEqual(['replay:a']); // recorded tier held
  });

  test('k tint changes cost k row writes, not a re-record', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const first = new RecordableLeaf('a');
    const second = new RecordableLeaf('b');
    const third = new RecordableLeaf('c');

    root.addChild(first);
    root.addChild(second);
    root.addChild(third);
    reachSpliceTier(root, harness);

    harness.events.length = 0;
    first.setTint(new Color(1, 2, 3));
    third.setTint(new Color(4, 5, 6));
    playFrame(root, harness.backend);

    expect(harness.tintPatches.map(patch => patch.localRow)).toEqual([0, 2]);
    expect(harness.events).toEqual(['replay:a,b,c']);
  });

  test('the same node tinted twice between frames is written once', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    reachSpliceTier(root, harness);

    leaf.setTint(new Color(1, 1, 1));
    leaf.setTint(new Color(9, 9, 9));
    playFrame(root, harness.backend);

    expect(harness.tintPatches).toEqual([{ localRow: 0, rgba: [9, 9, 9, 255] }]);
  });

  test('a content change that is NOT a tint still rebuilds', () => {
    // The other half of the channel split: a texture, geometry or blend-mode
    // change decides which batch a node belongs to, and no row write says that.
    const harness = createPatchingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    reachSpliceTier(root, harness);

    harness.events.length = 0;
    leaf.invalidateContent();
    playFrame(root, harness.backend);

    expect(harness.tintPatches).toEqual([]);
    expect(harness.events).toContain('flush:a'); // re-collected, not replayed
  });

  test('a tint change on a node the product never recorded writes nothing and forces nothing', () => {
    const harness = createPatchingBackend();
    const root = new Container();
    const recorded = new RecordableLeaf('a');
    const outsider = new RecordableLeaf('b');

    root.addChild(recorded);
    reachSpliceTier(root, harness);

    // Added after the capture, so it has no row in this product. The tint must
    // not be written against a row index the map does not hold - and it must
    // not force a rebuild either, because a colour that reaches no recorded
    // draw cannot change these pixels. The structure change this particular
    // node brought with it is what rebuilds the frame, on its own key.
    root.addChild(outsider);
    harness.events.length = 0;
    outsider.setTint(new Color(3, 3, 3));
    playFrame(root, harness.backend);

    expect(harness.tintPatches).toEqual([]);
  });

  test('tinting a node the capture CULLED keeps the product instead of rebuilding it', () => {
    // Found by measuring: a scene tinting off-screen nodes alternated collect
    // and replay forever, because an owned tint with no recorded row was read
    // as "cannot express this" rather than "cannot matter here".
    const harness = createPatchingBackend();
    const root = new Container();
    const onScreen = new RecordableLeaf('a');
    const offScreen = new RecordableLeaf('b');

    offScreen.cullable = true;
    offScreen.setPosition(100_000, 100_000);
    root.addChild(onScreen);
    root.addChild(offScreen);
    reachSpliceTier(root, harness);

    harness.events.length = 0;
    offScreen.setTint(new Color(3, 3, 3));
    playFrame(root, harness.backend);

    expect(harness.tintPatches).toEqual([]);
    expect(harness.events).toEqual(['replay:a']); // held the recorded tier

    root.destroy();
    harness.backend.destroy();
  });

  test('a tint change under ANOTHER root does not touch this product', () => {
    const harness = createPatchingBackend();
    const world = new Container();
    const other = new Container();
    const mine = new RecordableLeaf('a');
    const theirs = new RecordableLeaf('b');

    world.addChild(mine);
    other.addChild(theirs);
    reachSpliceTier(world, harness);
    reachSpliceTier(other, harness);

    harness.tintPatches.length = 0;
    theirs.setTint(new Color(7, 7, 7));
    playFrame(world, harness.backend);

    expect(harness.tintPatches).toEqual([]);

    world.destroy();
    other.destroy();
    harness.backend.destroy();
  });
});
