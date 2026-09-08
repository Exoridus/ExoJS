import { vi } from 'vitest';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { PersistentSlotBundle } from '#rendering/plan/persistentSlotDraw';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { View } from '#rendering/View';

/**
 * A change to a live entry's effect - a mask whose rect moved - is marked on
 * its own channel, and a product that holds the node as a live entry keeps
 * what it recorded: the effect is read live on every dispatch and was never
 * part of the product. What used to happen was a whole rebuild of the root on
 * every such frame, which for a scrolling clip is every frame.
 *
 * The tolerance is narrow on purpose, so the tests below pin both halves: the
 * three shapes that keep the product, and the changes that still rebuild.
 */

class Leaf extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.setLocalBounds(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true, _supportsPersistentSlots: true };

interface SlotStore extends PersistentSlotBundle {
  readonly ids: string[];
  readonly segments: Array<[offset: number, count: number]>;
}

interface Harness {
  backend: RenderBackend;
  events: string[];
  stores: SlotStore[];
  writes: number;
}

const createHarness = (): Harness => {
  const renderTarget = new RenderTarget(800, 600, true);
  const events: string[] = [];
  const stores: SlotStore[] = [];
  const harness = { events, stores, writes: 0 };

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
    pushScissorRect(rect: Rectangle) {
      events.push(`scissor:${String(rect.x)},${String(rect.y)},${String(rect.width)},${String(rect.height)}`);

      return backend;
    },
    popScissorRect() {
      events.push('popScissor');

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
      events.push((drawable as Leaf).id);

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
    _acquirePersistentSlots(): PersistentSlotBundle | null {
      const store: SlotStore = { generation: 1, ids: [], segments: [], destroy() {} };

      stores.push(store);

      return store;
    },
    _writePersistentSlots(bundle: PersistentSlotBundle, source: RenderRootSource, entered: Int32Array, count: number): void {
      const store = bundle as SlotStore;

      harness.writes++;

      for (let i = 0; i < count; i++) {
        const scope = source.scopes[entered[i * 3]!]!;

        store.ids[entered[i * 3 + 2]!] = (scope.items.drawables[entered[i * 3 + 1]!] as Leaf).id;
      }
    },
    _drawPersistentOrder(bundle: PersistentSlotBundle, order: Uint32Array, _orderCount: number, offset: number, count: number): void {
      const store = bundle as SlotStore;

      store.segments.push([offset, count]);

      for (let i = offset; i < offset + count; i++) {
        events.push(store.ids[order[i]!]!);
      }
    },
  } as unknown as RenderBackend;

  return Object.assign(harness, { backend });
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

const viewAt = (centerX: number): View => new View(centerX, 300, 800, 600);

const addLeaves = (parent: Container, prefix: string, count: number, startX: number): Leaf[] => {
  const leaves: Leaf[] = [];

  for (let i = 0; i < count; i++) {
    const leaf = new Leaf(`${prefix}${String(i)}`);

    leaf.setPosition(startX + i * 20, 300);
    parent.addChild(leaf);
    leaves.push(leaf);
  }

  return leaves;
};

const ids = (prefix: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`);

/** Root: four leaves, a rect-masked container of three leaves, four more leaves. */
const createMaskedScene = (): { root: Container; clip: Container; leaves: Leaf[] } => {
  const root = new Container();

  root.cullable = false;

  const leaves = addLeaves(root, 'a', 4, 100);
  const clip = new Container();

  clip.cullable = false;
  clip.mask = new Rectangle(0, 0, 400, 300);
  addLeaves(clip, 'c', 3, 200);
  root.addChild(clip);
  addLeaves(root, 'b', 4, 300);

  return { root, clip, leaves };
};

/** Same camera on every frame: a masked root discovers its source on its first clean frame and draws from slots after. */
const settleOnSlots = (root: RenderNode, backend: RenderBackend, frames = 4): void => {
  backend.setView(viewAt(400));

  for (let i = 0; i < frames; i++) {
    playFrame(root, backend);
  }
};

const frameEvents = (harness: Harness, root: RenderNode): string[] => {
  harness.events.length = 0;
  playFrame(root, harness.backend);

  return harness.events.slice();
};

const maskedFrame = (rect: string): string[] => [...ids('a', 4), `scissor:${rect}`, ...ids('c', 3), 'popScissor', ...ids('b', 4)];

describe('a live entry effect change keeps the root on the slot tier', () => {
  test('a mask rect that moves every frame is applied without leaving the slot tier or rewriting a slot', () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    settleOnSlots(root, harness.backend);

    const collectSpy = vi.spyOn(root, '_collectForRenderPlan');
    const store = harness.stores[0]!;
    const segmentsBefore = store.segments.length;

    harness.writes = 0;

    for (let i = 1; i <= 3; i++) {
      clip.mask = new Rectangle(10 * i, 0, 400, 300);

      const events = frameEvents(harness, root);

      expect(events).toEqual(maskedFrame(`${String(10 * i)},0,400,300`));
    }

    // Every frame drew its two segments from the store - the root never left
    // the slot tier for the capture replay or the rebuild path.
    expect(store.segments.length).toBe(segmentsBefore + 6);
    expect(collectSpy).not.toHaveBeenCalled();
    expect(harness.writes).toBe(0);
    expect(harness.stores).toHaveLength(1);

    root.destroy();
    harness.backend.destroy();
  });

  test('a mask that moves from the first frame on still lets the root earn its source', () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    harness.backend.setView(viewAt(400));

    // The root never sees two frames with the same content key: every frame
    // re-assigns the rect. The capture absorbs each move, and a frame the
    // capture absorbed has to count as a repeat for the build gate, or a
    // scrolling clip would replay its entries forever.
    for (let i = 1; i <= 4; i++) {
      clip.mask = new Rectangle(10 * i, 0, 400, 300);
      playFrame(root, harness.backend);
    }

    expect(harness.stores).toHaveLength(1);

    const store = harness.stores[0]!;
    const segmentsBefore = store.segments.length;
    const collectSpy = vi.spyOn(root, '_collectForRenderPlan');

    clip.mask = new Rectangle(50, 0, 400, 300);

    expect(frameEvents(harness, root)).toEqual(maskedFrame('50,0,400,300'));
    expect(store.segments.length).toBe(segmentsBefore + 2);
    expect(collectSpy).not.toHaveBeenCalled();

    root.destroy();
    harness.backend.destroy();
  });

  test("a change below the mask is the mask's business: the outer root keeps its source", () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    settleOnSlots(root, harness.backend);

    const collectSpy = vi.spyOn(root, '_collectForRenderPlan');
    const store = harness.stores[0]!;
    const segmentsBefore = store.segments.length;
    const inner = clip.children[0] as Leaf;

    // A tint change on a leaf under the mask: the mask's content is its own
    // root's concern, the outer source holds nothing about it.
    inner.tint = new Color(255, 0, 0);

    const events = frameEvents(harness, root);

    expect(events).toEqual(maskedFrame('0,0,400,300'));
    expect(store.segments.length).toBe(segmentsBefore + 2);
    expect(collectSpy).not.toHaveBeenCalled();

    root.destroy();
    harness.backend.destroy();
  });

  test("the mask content's own root tolerates the effect change on its root node", () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    settleOnSlots(root, harness.backend);

    // The clip's content holds only leaves and replays from its capture. The
    // mask sits on the clip node itself - the content root - and is played by
    // the outer barrier, so the content's capture stays valid.
    const collectSpy = vi.spyOn(clip, '_collectForRenderPlan');

    clip.mask = new Rectangle(20, 20, 300, 200);
    frameEvents(harness, root);
    clip.mask = new Rectangle(30, 30, 300, 200);

    const events = frameEvents(harness, root);

    expect(events).toEqual(maskedFrame('30,30,300,200'));
    expect(collectSpy).not.toHaveBeenCalled();

    root.destroy();
    harness.backend.destroy();
  });
});

describe('changes that still rebuild', () => {
  test('a mask added to a plain container makes it a live entry the source does not hold yet', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;
    addLeaves(root, 'a', 2, 100);

    const group = new Container();

    group.cullable = false;
    addLeaves(group, 'g', 2, 200);
    root.addChild(group);
    addLeaves(root, 'b', 2, 300);
    settleOnSlots(root, harness.backend);

    group.mask = new Rectangle(0, 0, 400, 300);

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 2), 'scissor:0,0,400,300', ...ids('g', 2), 'popScissor', ...ids('b', 2)]);

    root.destroy();
    harness.backend.destroy();
  });

  test('a mask removed from a live entry turns it back into ordinary content', () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    settleOnSlots(root, harness.backend);

    clip.mask = null;

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 4), ...ids('c', 3), ...ids('b', 4)]);
    expect(events.some(event => event.startsWith('scissor'))).toBe(false);

    root.destroy();
    harness.backend.destroy();
  });

  test('a content change on the root itself - not its effect - still rebuilds', () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    settleOnSlots(root, harness.backend);

    // Draw order is content the clip's own product recorded; a change to it
    // on the root node is not its effect, so the product rebuilds. The whole
    // frame still draws in order.
    const collectSpy = vi.spyOn(clip, '_collectForRenderPlan');

    clip.preserveDrawOrder = true;

    const events = frameEvents(harness, root);

    expect(events).toEqual(maskedFrame('0,0,400,300'));
    expect(collectSpy).toHaveBeenCalled();

    root.destroy();
    harness.backend.destroy();
  });
});

describe('the fragment tier applies the same rule', () => {
  test('a retained group with a masked child keeps its capture when the mask rect moves', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;

    const group = new RetainedContainer();

    group.cullable = false;
    addLeaves(group, 'g', 2, 100);

    const clip = new Container();

    clip.cullable = false;
    clip.mask = new Rectangle(0, 0, 400, 300);
    addLeaves(clip, 'c', 1, 200);
    group.addChild(clip);
    root.addChild(group);
    harness.backend.setView(viewAt(400));
    playFrame(root, harness.backend);
    playFrame(root, harness.backend);

    // The group's collect always runs - it is where the group decides between
    // replay and rebuild - so the signal is the capture: a rebuild snapshots
    // the scope again, a replay does not.
    const captureSpy = vi.spyOn(RetainedGroupFragment.prototype, 'capture');

    clip.mask = new Rectangle(5, 5, 400, 300);

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('g', 2), 'scissor:5,5,400,300', 'c0', 'popScissor']);
    expect(captureSpy).not.toHaveBeenCalled();
    captureSpy.mockRestore();

    root.destroy();
    harness.backend.destroy();
  });
});
