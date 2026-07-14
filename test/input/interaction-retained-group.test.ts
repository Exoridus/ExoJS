import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import { Scene } from '#core/Scene';
import { Signal } from '#core/Signal';
import type { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Vector } from '#math/Vector';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RetainedContainer } from '#rendering/RetainedContainer';

// ---------------------------------------------------------------------------
// Test helpers (file-local, mirrors spatial-index.test.ts)
// ---------------------------------------------------------------------------

interface MockPointerOptions {
  id?: number;
  x?: number;
  y?: number;
}

const makePointer = ({ id = 1, x = 0, y = 0 }: MockPointerOptions = {}): Pointer =>
  ({
    id,
    x,
    y,
    type: 'mouse',
    isPrimary: true,
  }) as unknown as Pointer;

interface MockSignals {
  onPointerDown: Signal<[Pointer]>;
  onPointerMove: Signal<[Pointer]>;
  onPointerUp: Signal<[Pointer]>;
  onPointerTap: Signal<[Pointer]>;
  onPointerCancel: Signal<[Pointer]>;
  onPointerLeave: Signal<[Pointer]>;
}

const createApp = (): {
  app: Application;
  scene: Scene;
  signals: MockSignals;
} => {
  const signals: MockSignals = {
    onPointerDown: new Signal<[Pointer]>(),
    onPointerMove: new Signal<[Pointer]>(),
    onPointerUp: new Signal<[Pointer]>(),
    onPointerTap: new Signal<[Pointer]>(),
    onPointerCancel: new Signal<[Pointer]>(),
    onPointerLeave: new Signal<[Pointer]>(),
  };

  const canvas = document.createElement('canvas');

  canvas.width = 800;
  canvas.height = 600;
  canvas.style.cursor = '';

  const scene = new Scene();

  const app = {
    canvas,
    width: 800,
    height: 600,
    input: signals as unknown as InputManager,
    focus: { focused: null, focus() {}, blur() {}, _notifyNodeRemoved() {} },
    rendering: {
      view: {
        screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }),
      },
    },
    scene: {
      get currentScene(): Scene | null {
        return scene;
      },
    },
  } as unknown as Application;

  return { app, scene, signals };
};

/** A drawable with real 0..50 local bounds — hit-testing goes through the engine's contains(). */
const makeSprite = (): Drawable => {
  const sprite = new Drawable();

  sprite.getLocalBounds().set(0, 0, 50, 50);

  return sprite;
};

describe('InteractionManager: hit-testing children of a translated RetainedContainer (F2)', () => {
  test('pointer over the WORLD position of a child inside a translated group fires its handler', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const child = makeSprite();

    group.setPosition(200, 100);
    group.addChild(child);
    scene.addChild(group);
    child.interactive = true;

    const handler = vi.fn();

    child.onPointerDown.add(handler);

    // World position of the child's 0..50 rect is 200..250 x 100..150.
    signals.onPointerDown.dispatch(makePointer({ x: 225, y: 125 }));
    im.update();

    expect(handler).toHaveBeenCalledTimes(1);

    im.destroy();
    scene.root.destroy();
  });

  test('pointer at the GROUP-LOCAL coordinates (where nothing is on screen) does NOT fire', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const child = makeSprite();

    group.setPosition(200, 100);
    group.addChild(child);
    scene.addChild(group);
    child.interactive = true;

    const handler = vi.fn();

    child.onPointerDown.add(handler);

    // (25, 25) is inside the child's GROUP-LOCAL rect but on screen the child
    // sits at 200..250 x 100..150 — a click here must miss.
    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();

    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    scene.root.destroy();
  });

  test('camera-pan pattern: moving the group between events retargets hits with no child mutation', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const child = makeSprite();

    group.addChild(child);
    scene.addChild(group);
    child.interactive = true;

    const handler = vi.fn();

    child.onPointerDown.add(handler);

    // Identity group: world rect 0..50.
    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    // Pan: the world moves under the pointer.
    group.setPosition(-300, 0);

    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();
    expect(handler).not.toHaveBeenCalled();

    signals.onPointerDown.dispatch(makePointer({ x: -275, y: 25 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    im.destroy();
    scene.root.destroy();
  });

  test('a rotated + scaled group hit-tests against the true oriented world quad', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const child = makeSprite();

    group.setPosition(300, 300);
    group.setRotation(45);
    group.setScale(2);
    group.addChild(child);
    scene.addChild(group);
    child.interactive = true;

    const handler = vi.fn();

    child.onPointerDown.add(handler);

    // Oracle: lift the child's local center into world space via the real
    // world matrix — the click there must hit.
    const worldCenter = new Vector(25, 25).transform(child.getWorldTransform());

    signals.onPointerDown.dispatch(makePointer({ x: worldCenter.x, y: worldCenter.y }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    // (250, 300) maps to group-local (-17.7, -17.7) — OUTSIDE the 0..50 rect
    // (but inside where the unrotated AABB around the origin would reach) —
    // must miss.
    signals.onPointerDown.dispatch(makePointer({ x: 250, y: 300 }));
    im.update();
    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    scene.root.destroy();
  });

  test('the recursive-walk path (input capture) is world-correct too', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const child = makeSprite();

    group.setPosition(200, 100);
    group.addChild(child);
    scene.addChild(group);
    child.interactive = true;

    // Confine hit-testing to the scene root subtree: this routes through the
    // recursive _hitTestNode walk instead of the spatial index.
    im.pushInputCapture(scene.root);

    const handler = vi.fn();

    child.onPointerDown.add(handler);

    signals.onPointerDown.dispatch(makePointer({ x: 225, y: 125 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();
    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    scene.root.destroy();
  });

  test('z-order across spaces: the later-registered node wins where world rects overlap', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    // World-space sprite covering 0..50.
    const worldSprite = makeSprite();

    scene.addChild(worldSprite);
    worldSprite.interactive = true;

    // Group shifted so its child ALSO covers world 0..50.
    const group = new RetainedContainer();
    const groupChild = makeSprite();

    group.setPosition(-100, 0);
    groupChild.setPosition(100, 0);
    group.addChild(groupChild);
    scene.addChild(group);
    groupChild.interactive = true; // registered later -> higher order

    const worldHandler = vi.fn();
    const groupHandler = vi.fn();

    worldSprite.onPointerDown.add(worldHandler);
    groupChild.onPointerDown.add(groupHandler);

    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();

    expect(groupHandler).toHaveBeenCalledTimes(1);
    expect(worldHandler).not.toHaveBeenCalled();

    im.destroy();
    scene.root.destroy();
  });

  test('moving the group re-indexes a non-anchored (barrier-effect) world-space child so hits track it', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const child = makeSprite();

    // A barrier effect (cacheAsBitmap) pushes the child OUT of the transform
    // group: it resolves world-space transforms and is therefore indexed in the
    // world quadtree (not the anchored side list). Its quadtree bucket is keyed
    // on its bounds at insertion time.
    child.cacheAsBitmap = true;
    group.addChild(child);
    scene.addChild(group);
    child.interactive = true;

    const handler = vi.fn();

    child.onPointerDown.add(handler);

    // Identity group: the child's world rect is 0..50 — a click there hits.
    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    // Move the group. The child follows in world space (200..250 x 100..150),
    // but its quadtree entry still buckets it at 0..50 unless the group move
    // re-indexes it. A click at its NEW rendered position must hit.
    group.setPosition(200, 100);

    signals.onPointerDown.dispatch(makePointer({ x: 225, y: 125 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    // ...and a click at the child's OLD position must now miss.
    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();
    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    scene.root.destroy();
  });

  test('moving the group re-indexes a non-anchored world-space DESCENDANT (grandchild under a barrier child)', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const barrierChild = new Container();
    const grandChild = makeSprite();

    // The barrier child escapes the group, taking its whole subtree to world
    // space with it — so the interactive grandchild is world-quadtree-indexed.
    barrierChild.cacheAsBitmap = true;
    barrierChild.addChild(grandChild);
    group.addChild(barrierChild);
    scene.addChild(group);
    grandChild.interactive = true;

    const handler = vi.fn();

    grandChild.onPointerDown.add(handler);

    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    group.setPosition(200, 100);

    signals.onPointerDown.dispatch(makePointer({ x: 225, y: 125 }));
    im.update();
    expect(handler).toHaveBeenCalledTimes(1);

    im.destroy();
    scene.root.destroy();
  });

  test('dev diagnostic: registering an interactive node under an engaged boundary warns once', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);
    const warnSpy = vi.spyOn(logger, 'warn');

    im.attachRoot(scene.root);

    const group = new RetainedContainer();
    const childA = makeSprite();
    const childB = makeSprite();

    group.addChild(childA);
    group.addChild(childB);
    scene.addChild(group);

    childA.interactive = true;
    childB.interactive = true;

    const groupWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('interactive'));

    expect(groupWarnings).toHaveLength(1);

    warnSpy.mockRestore();
    im.destroy();
    scene.root.destroy();
  });
});
