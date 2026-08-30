/**
 * Drag threshold semantics: a press on a draggable node is a candidate, not a
 * drag. Covers no movement, movement below the threshold, movement past it,
 * tap suppression after a real drag, and positioning under a transformed
 * parent - the coordinate space `node.position` actually lives in.
 */

import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneState } from '#core/scene/SceneState';
import { Signal } from '#core/Signal';
import type { ContextMenuRequest } from '#input/ContextMenuRequest';
import type { Gamepad } from '#input/Gamepad';
import type { GamepadButton } from '#input/GamepadButton';
import type { InputSystem } from '#input/InputSystem';
import { InteractionSystem } from '#input/InteractionSystem';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

import { frameDelta } from '../support/frame-delta';

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
  onPointerDown: Signal<[Pointer, number, number]>;
  onPointerMove: Signal<[Pointer, number, number]>;
  onPointerUp: Signal<[Pointer, number, number]>;
  onPointerTap: Signal<[Pointer, number, number]>;
}

const makePointer = (x: number, y: number, travelled = 0): Pointer =>
  ({ id: 1, x, y, type: 'mouse', isPrimary: true, maxDistanceFromPress: travelled }) as unknown as Pointer;

/** Dispatch a mock pointer through a mock signal with its own x/y, matching the real (pointer, x, y) shape. */
const dispatchPointer = (signal: Signal<[Pointer, number, number]>, x: number, y: number, travelled = 0): Pointer => {
  const pointer = makePointer(x, y, travelled);

  signal.dispatch(pointer, x, y);

  return pointer;
};

const createApp = (dragThreshold?: number): { app: Application; scene: Scene; signals: Signals; im: InteractionSystem } => {
  const signals = {
    onPointerDown: new Signal<[Pointer, number, number]>(),
    onPointerMove: new Signal<[Pointer, number, number]>(),
    onPointerUp: new Signal<[Pointer, number, number]>(),
    onPointerTap: new Signal<[Pointer, number, number]>(),
    onPointerCancel: new Signal<[Pointer, number, number]>(),
    onPointerLeave: new Signal<[Pointer, number, number]>(),
    onContextMenu: new Signal<[ContextMenuRequest]>(),
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
    onAnyGamepadButtonDown: new Signal<[Gamepad, GamepadButton, number]>(),
    _finishInteractionFrame: (): void => undefined,
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
    input: signals as unknown as InputSystem,
    rendering: { view: identity, screenView: identity },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
  } as unknown as Application;

  const im = new InteractionSystem(app);

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

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

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

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    dispatchPointer(signals.onPointerMove, 54, 52, 5);
    im.preUpdate(frameDelta);

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

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    dispatchPointer(signals.onPointerMove, 70, 50, 20);
    im.preUpdate(frameDelta);

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

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);
    dispatchPointer(signals.onPointerMove, 70, 50, 20);
    im.preUpdate(frameDelta);
    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);

    expect(started).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  it('honours a custom threshold from the application options', () => {
    const { scene, signals, im } = createApp(32);
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    dispatchPointer(signals.onPointerMove, 70, 50, 20);
    im.preUpdate(frameDelta);
    expect(started).not.toHaveBeenCalled();

    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);
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

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);
    dispatchPointer(signals.onPointerUp, 52, 50, 2);
    dispatchPointer(signals.onPointerTap, 52, 50, 2);
    im.preUpdate(frameDelta);

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

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);
    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);

    dispatchPointer(signals.onPointerUp, 90, 50, 40);
    dispatchPointer(signals.onPointerTap, 90, 50, 40);
    im.preUpdate(frameDelta);

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

    // Grab at world (50, 50) - parent-local (-50, 10), so the offset is (50, -10).
    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    dispatchPointer(signals.onPointerMove, 150, 90, 108);
    im.preUpdate(frameDelta);

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

    dispatchPointer(signals.onPointerDown, 0, 0);
    im.preUpdate(frameDelta);

    // 40 world pixels are 20 parent-local pixels under a 2× parent.
    dispatchPointer(signals.onPointerMove, 40, 40, 56);
    im.preUpdate(frameDelta);

    expect(sprite.position.x).toBeCloseTo(20);
    expect(sprite.position.y).toBeCloseTo(20);

    im.destroy();
  });
});

describe('reentrancy: node removed/destroyed inside its own handler', () => {
  it('a pointerdown handler that destroys its own node leaves no drag candidate to promote', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);
    // No removeChild first - the harder case: destroy() alone does not
    // unregister the node from the interaction system on its own.
    sprite.onPointerDown.add(() => sprite.destroy());

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    expect(() => {
      dispatchPointer(signals.onPointerMove, 90, 50, 40);
      im.preUpdate(frameDelta);
    }).not.toThrow();

    expect(started).not.toHaveBeenCalled();
    expect(im.getCapturedNodes()).toEqual([]);

    im.destroy();
  });

  it('a pointerdown handler that removes (not destroys) its own node via removeChild leaves no drag candidate', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const started = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(started);
    sprite.onPointerDown.add(() => scene.removeChild(sprite));

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);

    expect(started).not.toHaveBeenCalled();
    expect(im.getCapturedNodes()).toEqual([]);

    im.destroy();
  });

  it('a dragstart handler that destroys its own node leaves no stale drag state repositioning it', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const dragged = vi.fn();

    scene.addChild(sprite);
    sprite.onDragStart.add(() => sprite.destroy());
    sprite.onDrag.add(dragged);

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    // This move promotes the candidate, fires dragstart (which destroys the
    // node), and must not then reposition it or fire `drag`.
    expect(() => {
      dispatchPointer(signals.onPointerMove, 90, 50, 40);
      im.preUpdate(frameDelta);
    }).not.toThrow();

    expect(dragged).not.toHaveBeenCalled();
    expect(im.getCapturedNodes()).toEqual([]);

    // A further move must not resurrect stale state or throw either.
    expect(() => {
      dispatchPointer(signals.onPointerMove, 120, 50, 40);
      im.preUpdate(frameDelta);
    }).not.toThrow();

    im.destroy();
  });

  it('a drag handler that destroys its own node stops further drag ticks and clears capture', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const dragged = vi.fn();

    scene.addChild(sprite);
    sprite.onDrag.add(() => {
      dragged();
      sprite.destroy();
    });

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);

    // Promotes, fires dragstart, then the first `drag` tick - which destroys
    // the node from inside its own handler.
    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);

    expect(dragged).toHaveBeenCalledTimes(1);
    expect(im.getCapturedNodes()).toEqual([]);

    // A further move must find no captured node left to move or tick again.
    expect(() => {
      dispatchPointer(signals.onPointerMove, 120, 50, 40);
      im.preUpdate(frameDelta);
    }).not.toThrow();

    expect(dragged).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  it('a pointerup handler that destroys the dragged node suppresses dragend but still ends the drag state', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const ended = vi.fn();

    scene.addChild(sprite);
    sprite.onDragEnd.add(ended);
    sprite.onPointerUp.add(() => sprite.destroy());

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);
    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);

    expect(() => {
      dispatchPointer(signals.onPointerUp, 90, 50, 40);
      im.preUpdate(frameDelta);
    }).not.toThrow();

    // The node was already gone by the time dragend would have fired.
    expect(ended).not.toHaveBeenCalled();
    expect(im.getCapturedNodes()).toEqual([]);

    im.destroy();
  });

  it('a dragend handler that destroys a different node does not crash a later phase sharing the same flush', () => {
    const { scene, signals, im } = createApp();
    const sprite = draggable();
    const other = new TestSprite().setBounds(200, 0, 100, 100);
    const otherTap = vi.fn();

    other.interactive = true;
    scene.addChild(sprite);
    scene.addChild(other);
    other.onPointerTap.add(otherTap);
    sprite.onDragEnd.add(() => other.destroy());

    dispatchPointer(signals.onPointerDown, 50, 50);
    im.preUpdate(frameDelta);
    dispatchPointer(signals.onPointerMove, 90, 50, 40);
    im.preUpdate(frameDelta);

    // Release ends the drag (firing dragend, which destroys `other`), then a
    // tap-shaped release/tap pair over `other` shares the SAME flush.
    expect(() => {
      dispatchPointer(signals.onPointerUp, 90, 50, 40);
      dispatchPointer(signals.onPointerDown, 250, 50);
      dispatchPointer(signals.onPointerTap, 250, 50);
      im.preUpdate(frameDelta);
    }).not.toThrow();

    expect(otherTap).not.toHaveBeenCalled();

    im.destroy();
  });
});
