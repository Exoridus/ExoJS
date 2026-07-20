import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type { SceneScope } from '#core/SceneScope';
import { Signal } from '#core/Signal';
import { FocusManager } from '#input/FocusManager';
import type { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { Drawable } from '#rendering/Drawable';

// Camera offset so world-space coordinates differ from screen-space ones; the
// screenView stays identity, proving UI is hit-tested in screen space.
const CAMERA_OFFSET = 1000;

class TestSprite extends Drawable {
  private readonly _bounds = new Rectangle(0, 0, 0, 0);

  public setBounds(x: number, y: number, width: number, height: number): this {
    this._bounds.set(x, y, width, height);

    return this;
  }

  public override contains(x: number, y: number): boolean {
    return x >= this._bounds.x && x < this._bounds.x + this._bounds.width && y >= this._bounds.y && y < this._bounds.y + this._bounds.height;
  }

  public override getBounds(): Rectangle {
    return this._bounds.clone();
  }
}

const makePointer = (x: number, y: number, id = 1): Pointer => ({ id, x, y, type: 'mouse', isPrimary: true }) as unknown as Pointer;

const createUIApp = (): {
  scene: Scene;
  im: InteractionManager;
  focus: FocusManager;
  signals: {
    onPointerDown: Signal<[Pointer]>;
    onKeyDown: Signal<[number]>;
  };
} => {
  const signals = {
    onPointerDown: new Signal<[Pointer]>(),
    onPointerMove: new Signal<[Pointer]>(),
    onPointerUp: new Signal<[Pointer]>(),
    onPointerTap: new Signal<[Pointer]>(),
    onPointerCancel: new Signal<[Pointer]>(),
    onPointerLeave: new Signal<[Pointer]>(),
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
  };
  const canvas = document.createElement('canvas');
  const scene = new Scene();
  const app = {
    canvas,
    width: 800,
    height: 600,
    input: signals as unknown as InputManager,
    focus: null as FocusManager | null,
    interaction: null as InteractionManager | null,
    rendering: {
      view: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x: x + CAMERA_OFFSET, y: y + CAMERA_OFFSET }) },
      screenView: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) },
    },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
    },
  };
  const typed = app as unknown as Application;

  app.focus = new FocusManager(typed);
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
    signals.onPointerDown.dispatch(makePointer(80, 80));
    im.update();

    expect(handler).toHaveBeenCalledTimes(1);
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
    signals.onPointerDown.dispatch(makePointer(80, 80));
    im.update();

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
    signals.onPointerDown.dispatch(makePointer(400, 400));
    im.update();

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
