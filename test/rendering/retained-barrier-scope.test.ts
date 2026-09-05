import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import { type RetainedBatchInstruction, RetainedInstructionKind, type RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

/**
 * A barrier's CONTENT is retained like any other render root: a filter, a clip
 * or a cached container above a subtree used to force that subtree to be walked
 * out of the scene graph on every single frame, because a barrier-bearing node
 * never reached the plan builder's group branch.
 *
 * The effect itself stays live - it is resolved by the barrier entry and the
 * effect executor every frame - so the tests below pin both halves: the content
 * stops being re-walked, and every change inside it still reaches the next
 * frame's pixels.
 */

class RecordableLeaf extends Drawable {
  public constructor(public readonly id = '') {
    super();
    this.setLocalBounds(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true };

/**
 * File-local fake backend. `draw` records the leaf's id together with the two
 * values a replay could plausibly freeze - its world x and its tint - so a
 * change that fails to reach the next frame is visible in the event log rather
 * than only in a counter.
 */
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

    const drawn = pending.slice();

    pending.length = 0;
    events.push(`flush:${drawn.join(',')}`);

    if (activeCaptures.length > 0) {
      const batch: RetainedBatchInstruction = {
        kind: RetainedInstructionKind.Batch,
        bundle,
        generation: bundle.generation,
        instanceCount: drawn.length,
        drawCalls: 1,
        payload: { drawn },
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
    pushScissorRect(rect: Rectangle) {
      flushPending();
      events.push(`scissor:${String(rect.x)},${String(rect.y)},${String(rect.width)},${String(rect.height)}`);

      return backend;
    },
    popScissorRect() {
      flushPending();

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
      const leaf = drawable as RecordableLeaf;

      pending.push(`${leaf.id}@${String(leaf.getGlobalTransform().x)}/${leaf.tint.toString()}`);

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
      flushPending();
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
    replayRetainedBatch(batch: RetainedBatchInstruction): void {
      flushPending();
      events.push(`replay:${(batch.payload as { drawn: readonly string[] }).drawn.join(',')}`);
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

/** Everything a frame drew, in order, with the scissor and capture noise dropped. */
const drawnIn = (events: readonly string[]): string[] =>
  events.filter(event => event.startsWith('flush:') || event.startsWith('replay:')).map(event => event.slice(event.indexOf(':') + 1));

/** A clipped root holding two leaves, settled onto the retained tier. */
const settledClippedRoot = (): { backend: RenderBackend; events: string[]; root: Container; clipped: Container; leaf: RecordableLeaf } => {
  const { backend, events } = createRecordingBackend();
  const root = new Container();
  const clipped = new Container();
  const leaf = new RecordableLeaf('a');

  clipped.mask = new Rectangle(0, 0, 400, 300);
  clipped.addChild(leaf, new RecordableLeaf('b'));
  root.addChild(clipped);

  // Three frames: dirty collect, clean entry replay (which arms recording), and
  // the first frame that can splice.
  playFrame(root, backend);
  playFrame(root, backend);
  playFrame(root, backend);
  events.length = 0;

  return { backend, events, root, clipped, leaf };
};

/** The same two leaves under an unclipped root, settled the same way. */
const settledPlainRoot = (): { backend: RenderBackend; events: string[]; root: Container; leaf: RecordableLeaf } => {
  const { backend, events } = createRecordingBackend();
  const root = new Container();
  const leaf = new RecordableLeaf('a');

  root.addChild(leaf, new RecordableLeaf('b'));

  playFrame(root, backend);
  playFrame(root, backend);
  playFrame(root, backend);
  events.length = 0;

  return { backend, events, root, leaf };
};

describe('barrier content on the retained tier', () => {
  test("a clipped container's content reaches the instruction splice, with the clip still applied live", () => {
    const { backend, events, root } = settledClippedRoot();

    playFrame(root, backend);

    expect(events).toEqual(['scissor:0,0,400,300', 'replay:a@0/#ffffff,b@0/#ffffff']);

    root.destroy();
    backend.destroy();
  });

  test('a clip rect changed between frames takes effect immediately', () => {
    const { backend, events, root, clipped } = settledClippedRoot();

    clipped.mask = new Rectangle(10, 20, 100, 50);
    playFrame(root, backend);

    expect(events).toContain('scissor:10,20,100,50');

    root.destroy();
    backend.destroy();
  });

  test('a node moved inside the clipped subtree is drawn at its new position next frame', () => {
    const { backend, events, root, leaf } = settledClippedRoot();

    leaf.setPosition(64, 0);
    playFrame(root, backend);

    expect(drawnIn(events).join('|')).toContain('a@64');

    root.destroy();
    backend.destroy();
  });

  test('a tint inside the clipped subtree takes the same tier path as one under a plain root', () => {
    // The tint itself is corrected in the backend's own row store (patchTintRow),
    // which this plan-level fake does not model - so what is pinned here is the
    // part the barrier could break: a clipped subtree must reach the same tier
    // decision on a tint mark as an unclipped one, never a staler one.
    const clipped = settledClippedRoot();

    clipped.leaf.tint = Color.fromHex(0xff0000);
    playFrame(clipped.root, clipped.backend);

    const plain = settledPlainRoot();

    plain.leaf.tint = Color.fromHex(0xff0000);
    playFrame(plain.root, plain.backend);

    expect(drawnIn(clipped.events)).toHaveLength(drawnIn(plain.events).length);
    expect(clipped.events.map(event => event.split(':')[0])).toEqual(['scissor', ...plain.events.map(event => event.split(':')[0])]);

    clipped.root.destroy();
    clipped.backend.destroy();
    plain.root.destroy();
    plain.backend.destroy();
  });

  test('a node added inside the clipped subtree is drawn next frame', () => {
    const { backend, events, root, clipped } = settledClippedRoot();

    clipped.addChild(new RecordableLeaf('c'));
    playFrame(root, backend);

    expect(drawnIn(events).join('|')).toContain('c@0');

    root.destroy();
    backend.destroy();
  });

  test('a node removed from the clipped subtree stops being drawn next frame', () => {
    const { backend, events, root, leaf } = settledClippedRoot();

    leaf.destroy();
    playFrame(root, backend);

    const drawn = drawnIn(events).join('|');

    expect(drawn).not.toContain('a@');
    expect(drawn).toContain('b@');

    root.destroy();
    backend.destroy();
  });

  test('a clipped container nested inside another retains at every level, the outer one on entry replay', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const outer = new Container();
    const inner = new Container();

    outer.mask = new Rectangle(0, 0, 400, 300);
    inner.mask = new Rectangle(0, 0, 200, 150);
    inner.addChild(new RecordableLeaf('inner'));
    outer.addChild(new RecordableLeaf('outer'), inner);
    root.addChild(outer);

    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);
    events.length = 0;

    playFrame(root, backend);

    // Both clips are still applied live, in order.
    expect(events.filter(event => event.startsWith('scissor:'))).toEqual(['scissor:0,0,400,300', 'scissor:0,0,200,150']);
    // The innermost level, whose content holds no further barrier, reaches the
    // instruction splice. The level above it holds one and therefore stays on
    // entry replay - a recorded batch list cannot express a barrier, so a scope
    // containing one is not recordable (see isRetainedFragmentRecordable). Entry
    // replay is still the retained tier: no scene-graph walk, no cull, no
    // material resolve.
    expect(events.filter(event => event.startsWith('replay:'))).toEqual(['replay:inner@0/#ffffff']);
    expect(events.filter(event => event.startsWith('flush:'))).toEqual(['flush:outer@0/#ffffff']);

    root.destroy();
    backend.destroy();
  });
});
