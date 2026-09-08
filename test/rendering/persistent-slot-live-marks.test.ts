import { vi } from 'vitest';

import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { PersistentSlotBundle } from '#rendering/plan/persistentSlotDraw';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { View } from '#rendering/View';

/**
 * A live entry inside a render root - a mask, a transform-group boundary, a
 * view-dependent producer - used to withdraw the whole root from the persistent
 * slot tier. The order stream is now cut around each of them: the slots before
 * the entry draw as one segment, the entry is re-dispatched live, and the slots
 * after it draw as the next segment. The tests below pin the draw order against
 * the ordinary path, that the live entry stays live on the cached path, and
 * that the segments never include an empty draw.
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
  /** Everything that reached the backend, in order: leaf ids (through either path), scissor pushes and pops. */
  events: string[];
  /** One store per acquired root, in acquisition order. */
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
        const local = entered[i * 3 + 1]!;

        store.ids[entered[i * 3 + 2]!] = (scope.items.drawables[local] as Leaf).id;
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

/**
 * The build gate wants two consecutive rebuild frames over unchanged content,
 * so the camera leaves the scene and comes back before settling. A mask's
 * content climbs to its own source on the same frames, which is why every
 * masked container below is `cullable = false`: a culled container is not
 * collected at all on the far frame, and its content would never see the
 * second rebuild.
 */
const driveToSourceTier = (root: RenderNode, backend: RenderBackend): void => {
  backend.setView(viewAt(400));
  playFrame(root, backend);
  backend.setView(viewAt(100_000));
  playFrame(root, backend);
  backend.setView(viewAt(400));
  playFrame(root, backend);
  backend.setView(viewAt(401));
  playFrame(root, backend);
};

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
const createMaskedScene = (): { root: Container; clip: Container } => {
  const root = new Container();

  root.cullable = false;
  addLeaves(root, 'a', 4, 100);

  const clip = new Container();

  clip.cullable = false;
  clip.mask = new Rectangle(0, 0, 400, 300);
  addLeaves(clip, 'c', 3, 200);
  root.addChild(clip);
  addLeaves(root, 'b', 4, 300);

  return { root, clip };
};

const frameEvents = (harness: Harness, root: RenderNode): string[] => {
  harness.events.length = 0;
  playFrame(root, harness.backend);

  return harness.events.slice();
};

describe('persistent slots: a live entry cuts the order stream', () => {
  test('a masked container inside the root draws between two slot segments, in collect order', () => {
    const harness = createHarness();
    const { root } = createMaskedScene();

    driveToSourceTier(root, harness.backend);

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 4), 'scissor:0,0,400,300', ...ids('c', 3), 'popScissor', ...ids('b', 4)]);
    // The outer root: one segment before the mask, one after, none empty.
    expect(harness.stores[0]!.segments).toEqual([
      [0, 4],
      [4, 4],
    ]);

    root.destroy();
    harness.backend.destroy();
  });

  test('the mask content is a root of its own and takes the slot tier too', () => {
    const harness = createHarness();
    const { root } = createMaskedScene();

    driveToSourceTier(root, harness.backend);

    const events = frameEvents(harness, root);

    // Two stores: the outer root's and the clip content's, and nothing went
    // through the ordinary draw path.
    expect(harness.stores).toHaveLength(2);
    expect(harness.stores[1]!.segments.at(-1)).toEqual([0, 3]);
    expect(events).toEqual([...ids('a', 4), 'scissor:0,0,400,300', ...ids('c', 3), 'popScissor', ...ids('b', 4)]);

    root.destroy();
    harness.backend.destroy();
  });

  test('the cached selection still re-dispatches the live entry every frame', () => {
    const harness = createHarness();
    const { root } = createMaskedScene();

    driveToSourceTier(root, harness.backend);
    frameEvents(harness, root);
    harness.writes = 0;

    const store = harness.stores[0]!;
    const segmentsBefore = store.segments.length;

    // Same camera, nothing changed: the selection is served from the cache,
    // and the mask still runs its own collect on both frames.
    const first = frameEvents(harness, root);
    const second = frameEvents(harness, root);

    expect(first.filter(event => event.startsWith('scissor'))).toHaveLength(1);
    expect(second.filter(event => event.startsWith('scissor'))).toHaveLength(1);
    expect(store.segments.length).toBe(segmentsBefore + 4);
    expect(harness.writes).toBe(0);

    root.destroy();
    harness.backend.destroy();
  });

  test('a mask change takes effect on the next frame without rewriting a slot', () => {
    const harness = createHarness();
    const { root, clip } = createMaskedScene();

    driveToSourceTier(root, harness.backend);
    frameEvents(harness, root);
    harness.writes = 0;

    clip.mask = new Rectangle(10, 20, 300, 200);

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 4), 'scissor:10,20,300,200', ...ids('c', 3), 'popScissor', ...ids('b', 4)]);
    // A mask change is the effect's business, not the slot store's: no slot was
    // rewritten for it.
    expect(harness.writes).toBe(0);

    root.destroy();
    harness.backend.destroy();
  });

  test('a live entry at the start or the end of the scope produces no empty segment', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;

    const leading = new Container();

    leading.cullable = false;
    leading.mask = new Rectangle(0, 0, 400, 300);
    addLeaves(leading, 'x', 2, 100);
    root.addChild(leading);
    addLeaves(root, 'a', 3, 200);

    const trailing = new Container();

    trailing.cullable = false;
    trailing.mask = new Rectangle(0, 0, 500, 300);
    addLeaves(trailing, 'y', 2, 300);
    root.addChild(trailing);

    driveToSourceTier(root, harness.backend);

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual(['scissor:0,0,400,300', ...ids('x', 2), 'popScissor', ...ids('a', 3), 'scissor:0,0,500,300', ...ids('y', 2), 'popScissor']);
    expect(harness.stores[0]!.segments).toEqual([[0, 3]]);

    root.destroy();
    harness.backend.destroy();
  });

  test('two adjacent live entries draw nothing between them', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;
    addLeaves(root, 'a', 2, 100);

    for (const prefix of ['m', 'n']) {
      const clip = new Container();

      clip.cullable = false;
      clip.mask = new Rectangle(0, 0, 400, 300);
      addLeaves(clip, prefix, 1, 200);
      root.addChild(clip);
    }

    addLeaves(root, 'b', 2, 300);
    driveToSourceTier(root, harness.backend);

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 2), 'scissor:0,0,400,300', 'm0', 'popScissor', 'scissor:0,0,400,300', 'n0', 'popScissor', ...ids('b', 2)]);
    expect(harness.stores[0]!.segments).toEqual([
      [0, 2],
      [2, 2],
    ]);

    root.destroy();
    harness.backend.destroy();
  });

  test('a transform-group boundary is cut around the same way', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;
    addLeaves(root, 'a', 3, 100);

    const group = new RetainedContainer();

    group.cullable = false;
    addLeaves(group, 'g', 2, 200);
    root.addChild(group);
    addLeaves(root, 'b', 3, 300);
    driveToSourceTier(root, harness.backend);

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 3), ...ids('g', 2), ...ids('b', 3)]);
    expect(harness.stores[0]!.segments).toEqual([
      [0, 3],
      [3, 3],
    ]);

    root.destroy();
    harness.backend.destroy();
  });

  test('mixed z inside the scope still refuses the slot tier', () => {
    const harness = createHarness();
    const { root } = createMaskedScene();

    (root.children[0] as Leaf).zIndex = 1;
    driveToSourceTier(root, harness.backend);

    const events = frameEvents(harness, root);

    expect(harness.stores.flatMap(store => store.segments).filter(([, count]) => count === 4)).toEqual([]);
    expect(events).toContain('a1');

    root.destroy();
    harness.backend.destroy();
  });

  test('a static masked scene reaches the slot tier without a camera move', () => {
    const harness = createHarness();
    const { root } = createMaskedScene();

    // No excursion: the same view on every frame. The outer root holds a
    // capture the backend cannot record (the mask is a live entry in it), so its
    // first clean frame discovers a source instead of replaying, and the frame
    // after draws from slots. The mask's content holds only leaves, which IS
    // recordable, so it stays on the fragment tier - the source is for roots
    // that would otherwise replay every item forever.
    harness.backend.setView(viewAt(400));

    for (let i = 0; i < 3; i++) {
      playFrame(root, harness.backend);
    }

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 4), 'scissor:0,0,400,300', ...ids('c', 3), 'popScissor', ...ids('b', 4)]);
    expect(harness.stores).toHaveLength(1);
    expect(harness.stores[0]!.segments).toEqual([
      [0, 4],
      [4, 4],
    ]);

    root.destroy();
    harness.backend.destroy();
  });

  test('marks from a nested scope with a different z keep their stream positions', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;
    addLeaves(root, 'a', 2, 100);

    // A plain container whose children all sit at z 5: uniform inside its own
    // scope, so the slot tier admits it, while the root's own children sit at z
    // 0. The mask inside it and the mask under the root therefore reach the
    // slot scope with different z, and only their append order may decide the
    // playback order - a sort by z would swap them.
    const group = new Container();
    const inner = addLeaves(group, 'g', 1, 150);

    inner[0]!.zIndex = 5;

    const clipX = new Container();

    clipX.zIndex = 5;
    clipX.cullable = false;
    clipX.mask = new Rectangle(0, 0, 400, 300);
    addLeaves(clipX, 'x', 1, 200);
    group.addChild(clipX);
    root.addChild(group);

    const clipM = new Container();

    clipM.cullable = false;
    clipM.mask = new Rectangle(0, 0, 500, 300);
    addLeaves(clipM, 'm', 1, 250);
    root.addChild(clipM);
    addLeaves(root, 'b', 1, 300);
    driveToSourceTier(root, harness.backend);

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual([...ids('a', 2), 'g0', 'scissor:0,0,400,300', 'x0', 'popScissor', 'scissor:0,0,500,300', 'm0', 'popScissor', 'b0']);
    expect(harness.stores[0]!.segments).toEqual([
      [0, 3],
      [3, 1],
    ]);

    root.destroy();
    harness.backend.destroy();
  });

  test('a masked root whose leaf moves every frame keeps replaying instead of re-collecting', () => {
    const harness = createHarness();
    const { root } = createMaskedScene();
    const mover = root.children[0] as Leaf;

    harness.backend.setView(viewAt(400));
    playFrame(root, harness.backend);

    const collectSpy = vi.spyOn(root, '_collectForRenderPlan');

    // Each frame moves one leaf: the transform patch keeps the capture clean,
    // but the transform revision differs from the last rebuild's every time, so
    // no source would be built from such a frame - and it must not be spent on
    // a whole collect for nothing.
    for (let i = 1; i <= 3; i++) {
      mover.setPosition(100 + i, 300);
      playFrame(root, harness.backend);
    }

    expect(collectSpy).not.toHaveBeenCalled();

    root.destroy();
    harness.backend.destroy();
  });

  test('a root without live entries is one segment, as before', () => {
    const harness = createHarness();
    const root = new Container();

    root.cullable = false;
    addLeaves(root, 'a', 5, 100);
    driveToSourceTier(root, harness.backend);

    for (const store of harness.stores) store.segments.length = 0;

    const events = frameEvents(harness, root);

    expect(events).toEqual(ids('a', 5));
    expect(harness.stores[0]!.segments).toEqual([[0, 5]]);

    root.destroy();
    harness.backend.destroy();
  });
});
