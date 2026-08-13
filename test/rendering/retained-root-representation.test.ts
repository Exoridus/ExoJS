import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { type RetainedBatchInstruction, RetainedInstructionKind, type RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { View } from '#rendering/View';

/**
 * The automatic persistent render representation of a render ROOT: a plain
 * `Container` handed to `render()` climbs the same ladder a `RetainedContainer`
 * does — dirty collect, then clean entry replay that arms recording, then an
 * O(batches) instruction splice — without adopting any of the group's
 * semantics.
 */

class RecordableLeaf extends Drawable {
  public constructor(public readonly id = '') {
    super();
    this._setLocalBounds(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true };

interface FakeBatchPayload {
  readonly ids: readonly string[];
}

// File-local fake backend (repo convention keeps test harnesses file-local),
// recording the hook calls the retention ladder is observable through.
const createRecordingBackend = (): { backend: RenderBackend; events: string[]; renderTarget: RenderTarget } => {
  const renderTarget = new RenderTarget(800, 600, true);
  const events: string[] = [];
  const pending: string[] = [];
  const activeCaptures: RetainedInstructionSet[] = [];
  const bundle = { generation: 1 };

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
        payload: { ids } satisfies FakeBatchPayload,
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
      activeCaptures.push(set);
      events.push('beginCapture');
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
      events.push(`replay:${(batch.payload as FakeBatchPayload).ids.join(',')}`);
    },
  } as unknown as RenderBackend;

  return { backend, events, renderTarget };
};

const playFrame = (root: Container, backend: RenderBackend): void => {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(root, backend);

    RenderPlanOptimizer.optimize(plan);
    RenderPlanPlayer.play(plan, backend);
  } finally {
    RenderPlanBuilder.release(builder);
  }
};

const rootSetOf = (root: Container): RetainedInstructionSet | null => root._retainedRootRepresentation().fragment.instructions;

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as { _fragment: RetainedGroupFragment })._fragment;

/** A view whose world rect is `[0,0,800x600]`, matching the test render target. */
const defaultView = (): View => new View(400, 300, 800, 600);

describe('automatic render-root representation: ladder', () => {
  test('dirty collect -> clean entry replay records -> next clean frame splices in O(batches)', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();

    root.addChild(new RecordableLeaf('a'), new RecordableLeaf('b'));

    // F1: first collect. Recording does not arm on the capture frame
    // (record-on-first-clean-frame).
    playFrame(root, backend);

    expect(events).toContain('flush:a,b');
    expect(events).not.toContain('beginCapture');
    expect(rootSetOf(root)).toBeNull();

    // F2: clean -> entry replay + arm -> the player records this playback.
    events.length = 0;
    playFrame(root, backend);

    expect(events.filter(event => event === 'beginCapture')).toHaveLength(1);
    expect(events).toContain('flush:a,b'); // the record frame still draws normally
    expect(rootSetOf(root)?.hasRecording).toBe(true);

    // F3: clean + valid set -> splice. No per-draw work at all.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toEqual(['replay:a,b']);

    root.destroy();
    backend.destroy();
  });

  test('a content mutation drops the set and re-runs the ladder from a full collect', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);

    expect(rootSetOf(root)?.hasRecording).toBe(true);

    events.length = 0;
    leaf.invalidateContent();
    playFrame(root, backend);

    expect(events).toContain('flush:a'); // full collect again
    expect(events).not.toContain('replay:a');
    expect(rootSetOf(root)?.hasRecording).toBe(false);

    root.destroy();
    backend.destroy();
  });

  test('a descendant transform move re-collects: the default path has no group matrix and no row patch', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    root.addChild(leaf);
    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);

    expect(rootSetOf(root)?.hasRecording).toBe(true);

    events.length = 0;
    leaf.setPosition(40, 40);
    playFrame(root, backend);

    expect(events).toContain('flush:a');
    expect(events).not.toContain('replay:a');

    root.destroy();
    backend.destroy();
  });

  test('a move ABOVE the render root invalidates it — a root is not a closed dependency boundary', () => {
    const { backend, events } = createRecordingBackend();
    // The rendered node is `inner`; `world` is never collected, so none of its
    // mutations reach `inner`'s revisions — only its global transform stamp.
    const world = new Container();
    const inner = new Container();

    world.addChild(inner);
    inner.addChild(new RecordableLeaf('a'));

    playFrame(inner, backend);
    playFrame(inner, backend);
    playFrame(inner, backend);

    expect(rootSetOf(inner)?.hasRecording).toBe(true);

    events.length = 0;
    world.setPosition(100, 0);
    playFrame(inner, backend);

    expect(events).toContain('flush:a');
    expect(events).not.toContain('replay:a');

    world.destroy();
    backend.destroy();
  });

  test('destroy releases the representation', () => {
    const { backend } = createRecordingBackend();
    const root = new Container();

    root.addChild(new RecordableLeaf('a'));
    playFrame(root, backend);
    playFrame(root, backend);

    expect(rootSetOf(root)?.hasRecording).toBe(true);

    root.destroy();

    expect(rootSetOf(root)).toBeNull();

    backend.destroy();
  });
});

describe('automatic render-root representation: view dependence', () => {
  test('a view change that still contains every kept node replays the same capture', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    leaf.setPosition(400, 300); // well inside both views below
    root.addChild(leaf);
    backend.setView(defaultView());

    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);

    expect(events).toContain('replay:a');

    // Pan by 20/10: the world rect moves to [20,10 .. 820,610], which still
    // contains the leaf's [400,300 .. 416,316].
    events.length = 0;
    backend.setView(new View(420, 310, 800, 600));
    playFrame(root, backend);

    expect(events).toEqual(['replay:a']);

    root.destroy();
    backend.destroy();
  });

  test('a view change that no longer contains a kept node re-collects', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const leaf = new RecordableLeaf('a');

    leaf.setPosition(400, 300);
    root.addChild(leaf);
    backend.setView(defaultView());

    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);

    expect(events).toContain('replay:a');

    // Pan far enough that the leaf leaves the world rect entirely.
    events.length = 0;
    backend.setView(new View(2000, 300, 800, 600));
    playFrame(root, backend);

    expect(events).not.toContain('replay:a');

    root.destroy();
    backend.destroy();
  });

  test('a capture that culled something is view-locked: any view change re-collects', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const visible = new RecordableLeaf('a');
    const offscreen = new RecordableLeaf('b');

    visible.setPosition(400, 300);
    offscreen.setPosition(5000, 5000); // culled every frame
    root.addChild(visible, offscreen);
    backend.setView(defaultView());

    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);

    expect(events).toContain('replay:a');

    // A pan the containment test alone would have accepted — but a node WAS
    // culled, so the selection cannot be proven unchanged without an index.
    events.length = 0;
    backend.setView(new View(402, 300, 800, 600));
    playFrame(root, backend);

    expect(events).not.toContain('replay:a');

    root.destroy();
    backend.destroy();
  });
});

describe('automatic render-root representation: nested RetainedContainer', () => {
  test('a group under the root keeps its OWN retention tier — the root defers to it instead of swallowing its entries', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'), new RecordableLeaf('b'));
    root.addChild(group);

    // F1: both dirty. F2: the group entry-replays and arms ITS recording.
    playFrame(root, backend);
    playFrame(root, backend);

    expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

    // F3: the group splices its own set. The root never records over it — a
    // deferred boundary is a barrier record, and barriers are not recordable.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toEqual(['replay:a,b']);
    expect(rootSetOf(root)).toBeNull();

    // The group's own row-patch seam is still live, which is the whole point of
    // deferring: it only enqueues while it holds a committed recording.
    const leaf = group.children[0]!;

    fragmentOf(group).clearDirtyTransformRows();
    leaf.setPosition(3, 3);

    expect(fragmentOf(group).hasDirtyTransformRows()).toBe(true);

    root.destroy();
    backend.destroy();
  });

  test('a RetainedContainer used AS the render root is not double-retained', () => {
    const { backend } = createRecordingBackend();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));

    playFrame(group, backend);
    playFrame(group, backend);

    expect(group._supportsRootRetention()).toBe(false);
    expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

    group.destroy();
    backend.destroy();
  });
});
