import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { ContextMenuRequest } from '#input/ContextMenuRequest';
import { FocusController } from '#input/FocusController';
import type { Gamepad } from '#input/Gamepad';
import type { GamepadButton } from '#input/GamepadButton';
import type { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Panel } from '#ui/Panel';

import { frameDelta } from '../support/frame-delta';

// Camera offset so world-space coordinates differ from screen-space ones; the
// screenView stays identity, proving UI is hit-tested in screen space.
const CAMERA_OFFSET = 1000;

class TestSprite extends Drawable {
  private readonly _rect = new Rectangle(0, 0, 0, 0);

  public setBounds(x: number, y: number, width: number, height: number): this {
    this._rect.set(x, y, width, height);

    return this;
  }

  public override contains(x: number, y: number): boolean {
    return x >= this._rect.x && x < this._rect.x + this._rect.width && y >= this._rect.y && y < this._rect.y + this._rect.height;
  }

  public override getBounds(): Rectangle {
    return this._rect.clone();
  }
}

const makePointer = (x: number, y: number, id = 1): Pointer => ({ id, x, y, type: 'mouse', isPrimary: true }) as unknown as Pointer;

/** Dispatch a mock pointer through a mock signal with its own x/y, matching the real (pointer, x, y) shape. */
const dispatchPointer = (signal: Signal<[Pointer, number, number]>, x: number, y: number, id = 1): Pointer => {
  const pointer = makePointer(x, y, id);

  signal.dispatch(pointer, x, y);

  return pointer;
};

const createUIApp = (): {
  scene: Scene;
  im: InteractionManager;
  focus: FocusController;
  signals: {
    onPointerDown: Signal<[Pointer, number, number]>;
    onKeyDown: Signal<[number]>;
  };
} => {
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
  const scene = new Scene();
  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    input: signals as unknown as InputManager,
    focus: null as FocusController | null,
    interaction: null as InteractionManager | null,
    rendering: {
      view: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x: x + CAMERA_OFFSET, y: y + CAMERA_OFFSET }) },
      screenView: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) },
    },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active,
      _transitionGateOpen: false,
    },
  };
  const typed = app as unknown as Application;

  app.focus = new FocusController(typed);
  app.interaction = new InteractionManager(typed);
  scene._attach(typed, {} as unknown as SceneScope<void>);
  app.interaction.attachRoot(scene.root);

  return { scene, im: app.interaction, focus: app.focus, signals };
};

describe('Scene.ui', () => {
  test('is created lazily', () => {
    const { scene } = createUIApp();

    expect(scene._peekUI()).toBeNull();

    const ui = scene.ui;

    expect(scene._peekUI()).toBe(ui);
    expect(scene.ui).toBe(ui);
  });
});

describe('UI interaction routing', () => {
  test('hits a UI node in screen space even when the camera is panned', () => {
    const { scene, im, signals } = createUIApp();
    const button = new TestSprite().setBounds(50, 50, 100, 100);

    button.interactive = true;
    scene.ui.addChild(button);

    const handler = vi.fn();

    button.onPointerDown.add(handler);
    dispatchPointer(signals.onPointerDown, 80, 80);
    im.preUpdate(frameDelta);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('hit-testing follows the UI scale', () => {
    const { scene, im, signals } = createUIApp();
    const panel = new Panel({ width: 100, height: 50 });
    const handler = vi.fn();

    panel.interactive = true;
    scene.ui.addChild(panel);
    panel.onPointerDown.add(handler);

    // (150, 50) is outside the unscaled 100x50 panel...
    dispatchPointer(signals.onPointerDown, 150, 50);
    im.preUpdate(frameDelta);

    expect(handler).not.toHaveBeenCalled();

    // ...and inside it once the layer is drawn at twice the size, without the
    // panel's own layout size changing.
    scene.ui.uiScale = 2;
    dispatchPointer(signals.onPointerDown, 150, 50);
    im.preUpdate(frameDelta);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(panel.uiWidth).toBe(100);
  });

  test('UI layer takes precedence over the world at the same screen point', () => {
    const { scene, im, signals } = createUIApp();
    const button = new TestSprite().setBounds(50, 50, 100, 100);
    // World sprite placed where screen (80,80) maps to in camera space.
    const worldSprite = new TestSprite().setBounds(80 + CAMERA_OFFSET, 80 + CAMERA_OFFSET, 100, 100);

    button.interactive = true;
    worldSprite.interactive = true;
    scene.ui.addChild(button);
    scene.addChild(worldSprite);

    const uiHandler = vi.fn();
    const worldHandler = vi.fn();

    button.onPointerDown.add(uiHandler);
    worldSprite.onPointerDown.add(worldHandler);
    dispatchPointer(signals.onPointerDown, 80, 80);
    im.preUpdate(frameDelta);

    expect(uiHandler).toHaveBeenCalledTimes(1);
    expect(worldHandler).not.toHaveBeenCalled();
  });

  test('a pointer outside the UI falls through to the world layer', () => {
    const { scene, im, signals } = createUIApp();
    const button = new TestSprite().setBounds(50, 50, 100, 100);
    // World sprite under screen (400,400) → camera (1400,1400).
    const worldSprite = new TestSprite().setBounds(400 + CAMERA_OFFSET, 400 + CAMERA_OFFSET, 100, 100);

    button.interactive = true;
    worldSprite.interactive = true;
    scene.ui.addChild(button);
    scene.addChild(worldSprite);

    const uiHandler = vi.fn();
    const worldHandler = vi.fn();

    button.onPointerDown.add(uiHandler);
    worldSprite.onPointerDown.add(worldHandler);
    dispatchPointer(signals.onPointerDown, 400, 400);
    im.preUpdate(frameDelta);

    expect(uiHandler).not.toHaveBeenCalled();
    expect(worldHandler).toHaveBeenCalledTimes(1);
  });

  test('a focused UI node receives routed keyboard input', () => {
    const { scene, focus, signals } = createUIApp();
    const field = new TestSprite().setBounds(0, 0, 100, 30);

    field.focusable = true;
    scene.ui.addChild(field);

    const keys: number[] = [];

    field.onKeyDown.add(event => keys.push(event.channel));
    focus.focus(field);
    signals.onKeyDown.dispatch(Keyboard.Enter);

    expect(focus.focused).toBe(field);
    expect(keys).toEqual([Keyboard.Enter]);
  });
});

describe('Tab traversal without an explicit scope spans both scene layers', () => {
  test('a UI node and a world node are both Tab-reachable in one traversal', () => {
    const { scene, focus, signals } = createUIApp();
    const uiNode = new TestSprite().setBounds(0, 0, 10, 10);
    const worldNode = new TestSprite().setBounds(0, 0, 10, 10);

    uiNode.focusable = true;
    uiNode.tabIndex = 0;
    worldNode.focusable = true;
    worldNode.tabIndex = 1;
    scene.ui.addChild(uiNode);
    scene.addChild(worldNode);

    signals.onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(uiNode);

    signals.onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(worldNode);
  });

  test('on an equal tabIndex, the UI layer wins the tie over the world layer', () => {
    const { scene, focus, signals } = createUIApp();
    const uiNode = new TestSprite().setBounds(0, 0, 10, 10);
    const worldNode = new TestSprite().setBounds(0, 0, 10, 10);

    uiNode.focusable = true;
    worldNode.focusable = true;
    // World node added first, so document order alone would favor it - the
    // UI-layer tie-break must still win.
    scene.addChild(worldNode);
    scene.ui.addChild(uiNode);

    signals.onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(uiNode);
  });
});

describe('UI scope reactivation re-enforces the focus trap immediately', () => {
  test('blurs an escaped focus the instant a temporarily-detached UI scope root reattaches', () => {
    const { scene, im } = createUIApp();
    const modal = new Container();
    const insideModal = new Container();
    const outside = new Container();

    insideModal.focusable = true;
    outside.focusable = true;

    modal.addChild(insideModal);
    scene.ui.addChild(modal);
    scene.ui.addChild(outside);

    // Pushed (and later checked) through `im`, not the standalone `focus`
    // returned by `createUIApp` - the scope trap this exercises is enforced
    // by `InteractionManager`'s own internal FocusController, reached via
    // `im.pushScope`/`im.focus`/`im.focused`, not a separately constructed one.
    const token = im.pushScope(modal);

    im.focus(insideModal);
    expect(im.focused).toBe(insideModal);

    // Detach the scope root WITHOUT popping its scope entry - it goes dead
    // (see `FocusController._isOwned`'s doc comment), so it stops trapping
    // anything until it reattaches.
    scene.ui.removeChild(modal);

    // While dead, nothing traps focus - a direct focus() call elsewhere succeeds.
    im.focus(outside);
    expect(im.focused).toBe(outside);

    // Reattaching to the UI layer must re-enforce the trap immediately - this
    // exercises InteractionManager's UI hook bundle specifically, since the
    // UI layer never registers nodes into the world tree.
    scene.ui.addChild(modal);

    expect(im.focused).toBeNull();

    im.popScope(token);
  });
});

describe('attachUIRoot / detachUIRoot mirror attachRoot / detachRoot exactly (minus world-tree registration)', () => {
  test('a UI subtree built entirely while detached — modal, scope, and all — engages its trap the instant attachUIRoot runs', () => {
    const { scene, im } = createUIApp();
    const ui = scene.ui;
    const modal = new Container();
    const insideModal = new Container();
    const outside = new Container();

    insideModal.focusable = true;
    outside.focusable = true;
    scene.addChild(outside);

    im.detachUIRoot(ui);

    // Assembled - including its own scope - entirely while `ui` is detached,
    // then attached as one whole unit. `addChild`'s own per-node
    // notification never fires here because `ui` isn't on the stage yet.
    modal.addChild(insideModal);
    ui.addChild(modal);

    const token = im.pushScope(modal);

    im.focus(outside);
    expect(im.focused).toBe(outside);

    im.attachUIRoot(ui);

    // The trap engages from attachUIRoot itself, not from the next
    // unrelated focus() call.
    expect(im.focused).toBeNull();

    im.popScope(token);
  });

  test('detachUIRoot blurs focus living inside the UI subtree and removes only scopes rooted there', () => {
    const { scene, im } = createUIApp();
    const ui = scene.ui;
    const modal = new Container();
    const insideModal = new Container();
    const worldNode = new Container();

    insideModal.focusable = true;
    modal.addChild(insideModal);
    ui.addChild(modal);
    scene.addChild(worldNode);

    const worldToken = im.pushScope(worldNode);
    const uiToken = im.pushScope(modal);

    im.focus(insideModal);
    expect(im.focused).toBe(insideModal);

    im.detachUIRoot(ui);

    expect(im.focused).toBeNull();

    // The foreign world scope survives detachUIRoot untouched and is still
    // independently poppable; popping the UI scope's own (already-removed)
    // token is a no-op, per popScope's idempotency contract.
    expect(() => im.popScope(worldToken)).not.toThrow();
    expect(() => im.popScope(uiToken)).not.toThrow();
  });

  test('repeated attach/detach of the same UI root is idempotent and never corrupts a foreign scope', () => {
    const { scene, im } = createUIApp();
    const ui = scene.ui;
    const modal = new Container();
    const worldNode = new Container();

    modal.focusable = true;
    ui.addChild(modal);
    scene.addChild(worldNode);

    const worldToken = im.pushScope(worldNode);

    im.detachUIRoot(ui);
    im.attachUIRoot(ui);
    im.detachUIRoot(ui);
    im.attachUIRoot(ui);

    expect(() => im.popScope(worldToken)).not.toThrow();
  });
});

describe('UI Tab traversal excludes destroyed nodes', () => {
  test('a bare destroy() UI node (no removeChild) is excluded from Tab traversal', () => {
    const { scene, focus, signals } = createUIApp();
    const a = new Container();
    const b = new Container();

    a.focusable = true;
    b.focusable = true;
    scene.ui.addChild(a);
    scene.ui.addChild(b);

    b.destroy(); // no removeChild — still structurally reachable by the tree walk

    signals.onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(a);

    signals.onKeyDown.dispatch(Keyboard.Tab);
    // Wraps back to `a` - the sole surviving candidate - `b` is never a stop.
    expect(focus.focused).toBe(a);
  });
});

describe('UI directional navigation', () => {
  /** A focusable node with a real extent, so directional navigation has geometry to compare. */
  const spatial = (x: number, y: number): Container => {
    const node = new Container();

    node.focusable = true;
    node._setLocalBounds(0, 0, 10, 10);
    node.setPosition(x, y);

    return node;
  };

  test("the default 'ui' policy navigates the UI layer and stops at its edge", () => {
    const { scene, focus, signals } = createUIApp();
    const left = spatial(0, 0);
    const right = spatial(100, 0);
    const inWorld = spatial(200, 0);

    scene.ui.addChild(left).addChild(right);
    scene.root.addChild(inWorld);
    focus.focus(left);

    signals.onKeyDown.dispatch(Keyboard.Right);
    expect(focus.focused).toBe(right);

    // `inWorld` lies further right, but the UI layer is the whole candidate set.
    signals.onKeyDown.dispatch(Keyboard.Right);
    expect(focus.focused).toBe(right);

    focus.navigation = 'always';
    signals.onKeyDown.dispatch(Keyboard.Right);
    expect(focus.focused).toBe(inWorld);
  });
});
