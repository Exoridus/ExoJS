/**
 * The hit-tested node must be the visually topmost interactive one, which means
 * picking has to agree with the renderer's painter order: hierarchical, scoped
 * per container, `zIndex` local to its siblings and document order breaking
 * ties. These tests pin that contract down for cases the flat
 * registration-order index used to get wrong.
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

const makePointer = (x: number, y: number): Pointer => ({ id: 1, x, y, type: 'mouse', isPrimary: true }) as unknown as Pointer;

const createApp = (): { app: Application; scene: Scene; signals: { onPointerDown: Signal<[Pointer]> } } => {
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
  const scene = new Scene();
  const identity = { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) };

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
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

  return { app, scene, signals };
};

/** Dispatch a pointerdown at (x, y) and report which node the event targeted. */
const pick = (im: InteractionManager, signals: { onPointerDown: Signal<[Pointer]> }, scene: Scene, x: number, y: number): unknown => {
  let target: unknown = null;
  const probe = (): void => {
    target = im.getHoveredNode(1);
  };

  // getHoveredNode reflects the resolved hit, which the queue flush computes.
  signals.onPointerDown.dispatch(makePointer(x, y));
  im.update();
  probe();
  void scene;

  return target;
};

/** A 100×100 interactive sprite covering the same spot as every other one here. */
const overlapping = (): TestSprite => {
  const sprite = new TestSprite().setBounds(0, 0, 100, 100);

  sprite.interactive = true;

  return sprite;
};

describe('siblings', () => {
  it('lets the higher zIndex win regardless of document order', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const below = overlapping();
    const above = overlapping();

    // `above` is added FIRST, so only zIndex can put it on top.
    above.zIndex = 10;
    scene.root.addChild(above);
    scene.root.addChild(below);

    expect(pick(im, signals, scene, 50, 50)).toBe(above);

    im.destroy();
  });

  it('falls back to document order when zIndex ties', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const first = overlapping();
    const last = overlapping();

    scene.root.addChild(first);
    scene.root.addChild(last);

    expect(pick(im, signals, scene, 50, 50)).toBe(last);

    im.destroy();
  });

  it('follows a zIndex changed after the nodes were registered', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const first = overlapping();
    const last = overlapping();

    scene.root.addChild(first);
    scene.root.addChild(last);
    expect(pick(im, signals, scene, 50, 50)).toBe(last);

    first.zIndex = 5;
    expect(pick(im, signals, scene, 50, 50)).toBe(first);

    im.destroy();
  });
});

describe('nesting', () => {
  it('keeps a deep descendant inside its ancestors scope', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    // branchA renders below branchB, so nothing inside branchA may surface
    // above branchB's content no matter how high its own zIndex.
    const branchA = new Container();
    const branchB = new Container();

    scene.root.addChild(branchA);
    scene.root.addChild(branchB);

    const deep = overlapping();
    const shallow = overlapping();

    deep.zIndex = 1000;
    branchA.addChild(deep);
    branchB.addChild(shallow);

    expect(pick(im, signals, scene, 50, 50)).toBe(shallow);

    im.destroy();
  });

  it('resolves a deep child against a root-level sibling by their diverging branches', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const branch = new Container();
    const rootSibling = overlapping();

    scene.root.addChild(branch);
    scene.root.addChild(rootSibling);

    const inner = new Container();
    const deep = overlapping();

    branch.addChild(inner);
    inner.addChild(deep);

    // `branch` precedes `rootSibling` in document order, so the root sibling wins.
    expect(pick(im, signals, scene, 50, 50)).toBe(rootSibling);

    // Lifting the whole branch lifts everything inside it.
    branch.zIndex = 1;
    expect(pick(im, signals, scene, 50, 50)).toBe(deep);

    im.destroy();
  });

  it('paints a child above its own interactive ancestor', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const parent = new Container();
    const child = overlapping();

    parent.interactive = true;
    scene.root.addChild(parent);
    parent.addChild(child);

    expect(pick(im, signals, scene, 50, 50)).toBe(child);

    im.destroy();
  });

  it('finds an interactive child under a non-interactive parent', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const parent = new Container();
    const child = overlapping();

    parent.interactive = false;
    scene.root.addChild(parent);
    parent.addChild(child);

    expect(pick(im, signals, scene, 50, 50)).toBe(child);

    im.destroy();
  });
});

describe('visibility', () => {
  it('does not hit an invisible node', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const hidden = overlapping();
    const shown = overlapping();

    scene.root.addChild(shown);
    scene.root.addChild(hidden);
    hidden.zIndex = 10;
    hidden.visible = false;

    expect(pick(im, signals, scene, 50, 50)).toBe(shown);

    im.destroy();
  });

  it('does not hit a visible node inside an invisible container', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const hiddenBranch = new Container();
    const child = overlapping();

    scene.root.addChild(hiddenBranch);
    hiddenBranch.addChild(child);
    hiddenBranch.visible = false;

    expect(pick(im, signals, scene, 50, 50)).toBeNull();

    im.destroy();
  });
});

describe('scoped hit-testing', () => {
  it('resolves order the same way inside an interaction scope', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const modal = new Container();
    const below = overlapping();
    const above = overlapping();

    above.zIndex = 3;
    scene.root.addChild(modal);
    modal.addChild(above);
    modal.addChild(below);

    im.pushScope(modal);

    expect(pick(im, signals, scene, 50, 50)).toBe(above);

    im.popScope();
    im.destroy();
  });
});
