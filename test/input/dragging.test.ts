/**
 * Drag threshold semantics: a press on a draggable node is a candidate, not a
 * drag. Covers no movement, movement below the threshold, movement past it,
 * tap suppression after a real drag, and positioning under a transformed
 * parent — the coordinate space `node.position` actually lives in.
 */

import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

class TestSprite extends Drawable {
  private _left = 0;
  private _top = 0;
  private _width = 0;
  private _height = 0;

  public setBounds(left: number, top: number, width: number, height: number): this {
    this._left = left;
    this._top = top;
    this._width = width;
    this._height = height;

    return this;
  }

  public override contains(x: number, y: number): boolean {
    return x >= this._left && x < this._left + this._width && y >= this._top && y < this._top + this._height;
  }

  public override getBounds(): Rectangle {
    return new Rectangle(this._left, this._top, this._width, this._height);
  }
}

interface Signals {
  onPointerDown: Signal<[Pointer]>;
  onPointerMove: Signal<[Pointer]>;
  onPointerUp: Signal<[Pointer]>;
  onPointerTap: Signal<[Pointer]>;
}

const makePointer = (x: number, y: number, travelled = 0): Pointer =>
  ({ id: 1, x, y, type: 'mouse', isPrimary: true, maxDistanceFromPress: travelled }) as unknown as Pointer;

const createApp = (dragThreshold?: number): { app: Application; scene: Scene; signals: Signals; im: InteractionManager } => {
  const signals = {
    onPointerDown: new Signal<[Pointer]>(),
    onPointerMove: new Signal<[Pointer]>(),
    onPointerUp: new Signal<[Pointer]>(),
    onPointerTap: new Signal<[Pointer]>(),
    onPointerCancel: new Signal<[Pointer]>(),
    onPointerLeave: new Signal<[Pointer]>(),
    onContextMenu: new Signal<[Pointer]>(),
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
  };
  const canvas = document.createElement('canvas');

  Object.defineProperty(canvas, 'setPointerCapture', { value: () => undefined, writable: true, configurable: true });
  Object.defineProperty(canvas, 'releasePointerCapture', { value: () => undefined, writable: true, configurable: true });

  const scene = new Scene();
  const identity = { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) };

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    options: { input: dragThreshold === undefined ? {} : { dragThreshold } },
    input: signals as unknown as InputManager,
    rendering: { view: identity, screenView: identity },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
  } as unknown as Application;

  const im = new InteractionManager(app);

  im.attachRoot(scene.root);

  return { app, scene, signals, im };
};

const draggable = (): TestSprite => {
  const sprite = new TestSprite().setBounds(0, 0, 100, 100);

  sprite.interactive = true;
  sprite.draggable = true;

  return sprite;
};

describe('drag threshold', () => {
  it('does not start a drag on a press with no movement', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();

    expect(started).not.toHaveBeenCalled();
    expect(im.getCapturedNodes()).toEqual([]);

    im.destroy();
  });

  it('does not start a drag while movement stays below the threshold', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const started = vi.fn();
    const dragged = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);
    sprite.onDrag.add(dragged);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();

    signals.onPointerMove.dispatch(makePointer(54, 52, 5));
    im.update();

    expect(started).not.toHaveBeenCalled();
    expect(dragged).not.toHaveBeenCalled();
    expect(sprite.position.x).toBe(0);

    im.destroy();
  });

  it('starts the drag on the first move past the threshold', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();

    signals.onPointerMove.dispatch(makePointer(70, 50, 20));
    im.update();

    expect(started).toHaveBeenCalledTimes(1);
    expect(im.getCapturedNodes()).toEqual([sprite]);

    im.destroy();
  });

  it('fires dragstart only once across further moves', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();
    signals.onPointerMove.dispatch(makePointer(70, 50, 20));
    im.update();
    signals.onPointerMove.dispatch(makePointer(90, 50, 40));
    im.update();

    expect(started).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  it('honours a custom threshold from the application options', () => {
    const { scene, signals, im } = createApp(32);
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();

    signals.onPointerMove.dispatch(makePointer(70, 50, 20));
    im.update();
    expect(started).not.toHaveBeenCalled();

    signals.onPointerMove.dispatch(makePointer(90, 50, 40));
    im.update();
    expect(started).toHaveBeenCalledTimes(1);

    im.destroy();
  });
});

describe('tap after drag', () => {
  it('still taps a draggable node that was pressed without dragging', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const tapped = vi.fn();

    scene.addChild(sprite);
    sprite.onPointerTap.add(tapped);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();
    signals.onPointerUp.dispatch(makePointer(52, 50, 2));
    signals.onPointerTap.dispatch(makePointer(52, 50, 2));
    im.update();

    expect(tapped).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  it('does not tap after a real drag', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const tapped = vi.fn();
    const ended = vi.fn();

    scene.addChild(sprite);
    sprite.onPointerTap.add(tapped);
    sprite.onDragEnd.add(ended);

    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();
    signals.onPointerMove.dispatch(makePointer(90, 50, 40));
    im.update();

    signals.onPointerUp.dispatch(makePointer(90, 50, 40));
    signals.onPointerTap.dispatch(makePointer(90, 50, 40));
    im.update();

    expect(ended).toHaveBeenCalledTimes(1);
    expect(tapped).not.toHaveBeenCalled();

    im.destroy();
  });
});

describe('parent-local positioning', () => {
  it('tracks the pointer under a translated parent', () => {
    const { scene, signals, im } = createApp();
    const parent = new Container();
    const sprite = draggable();

    parent.position.set(100, 40);
    scene.root.addChild(parent);
    parent.addChild(sprite);
    parent.getWorldTransform();

    // Grab at world (50, 50) — parent-local (-50, 10), so the offset is (50, -10).
    signals.onPointerDown.dispatch(makePointer(50, 50));
    im.update();

    signals.onPointerMove.dispatch(makePointer(150, 90, 108));
    im.update();

    // World (150, 90) is parent-local (50, 50); plus the grab offset → (100, 40).
    expect(sprite.position.x).toBeCloseTo(100);
    expect(sprite.position.y).toBeCloseTo(40);

    im.destroy();
  });

  it('tracks the pointer under a scaled parent', () => {
    const { scene, signals, im } = createApp();
    const parent = new Container();
    const sprite = draggable();

    parent.scale.set(2, 2);
    scene.root.addChild(parent);
    parent.addChild(sprite);
    parent.getWorldTransform();

    signals.onPointerDown.dispatch(makePointer(0, 0));
    im.update();

    // 40 world pixels are 20 parent-local pixels under a 2× parent.
    signals.onPointerMove.dispatch(makePointer(40, 40, 56));
    im.update();

    expect(sprite.position.x).toBeCloseTo(20);
    expect(sprite.position.y).toBeCloseTo(20);

    im.destroy();
  });
});
