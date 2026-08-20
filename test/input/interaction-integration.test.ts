/**
 * End-to-end InputManager + InteractionManager integration tests: real
 * PointerEvents dispatched on a real canvas, through a real InputManager,
 * into a real InteractionManager - no mocked signals. Covers the phase-level
 * defects the mocked-signal test suites (interaction.test.ts, dragging.test.ts)
 * cannot exercise, because those construct a bare Pointer stub with a single
 * (x, y) rather than letting a real Pointer/InputManager produce the distinct
 * press/move/release/context-menu coordinates a real frame collapses.
 */

import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneState } from '#core/SceneState';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
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

const sprite = (left: number, top: number, size = 40): TestSprite => {
  const s = new TestSprite().setBounds(left, top, size, size);

  s.interactive = true;

  return s;
};

interface Harness {
  app: Application;
  scene: Scene;
  canvas: HTMLCanvasElement;
  input: InputManager;
  im: InteractionManager;
  fire: (type: string, init: PointerEventInit) => void;
}

/**
 * A full real InputManager + InteractionManager pair sharing one canvas -
 * dispatching a genuine platform PointerEvent and calling `flush()` runs the
 * exact pipeline a live Application does (input.preUpdate() then
 * interaction.preUpdate()).
 */
const createHarness = (dragThreshold?: number): Harness => {
  const canvas = document.createElement('canvas');

  canvas.width = 800;
  canvas.height = 600;

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  Object.defineProperty(canvas, 'setPointerCapture', { value: () => undefined, writable: true, configurable: true });
  Object.defineProperty(canvas, 'releasePointerCapture', { value: () => undefined, writable: true, configurable: true });

  const scene = new Scene();
  const identity = { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) };
  const platform = new BrowserPlatform(canvas);

  const app = {
    canvas,
    platform,
    width: 800,
    height: 600,
    pixelRatio: 1,
    options: { input: dragThreshold === undefined ? {} : { dragThreshold } },
    rendering: { view: identity, screenView: identity },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
    _backingStoreToDesign: (x: number, y: number): { x: number; y: number } => ({ x, y }),
  } as unknown as Application;

  const input = new InputManager(app);

  (app as unknown as { input: InputManager }).input = input;

  const im = new InteractionManager(app);

  im.attachRoot(scene.root);

  const fire = (type: string, init: PointerEventInit): void => {
    canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init }));
  };

  return { app, scene, canvas, input, im, fire };
};

const flush = (h: Harness): void => {
  h.input.preUpdate(0 as never);
  h.im.preUpdate();
};

beforeAll(() => {
  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => [] as unknown as ReturnType<Navigator['getGamepads']>,
  });
});

describe('phase-correct hit-testing within one frame flush', () => {
  it('hit-tests press, move and release against the node each actually happened over', () => {
    const h = createHarness();
    const left = sprite(0, 0);
    const right = sprite(200, 0);

    h.scene.addChild(left);
    h.scene.addChild(right);

    const leftDown = vi.fn();
    const leftUp = vi.fn();
    const rightMove = vi.fn();

    left.onPointerDown.add(leftDown);
    left.onPointerUp.add(leftUp);
    right.onPointerMove.add(rightMove);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);

    // Down over `left`, a fast move sweeps over `right`, release back over `left`
    // - all collapsed into one frame, before either manager ever flushes.
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    h.fire('pointermove', { clientX: 210, clientY: 10, buttons: 1 });
    h.fire('pointerup', { clientX: 10, clientY: 10, buttons: 0 });
    flush(h);

    expect(leftDown).toHaveBeenCalledTimes(1);
    expect(leftUp).toHaveBeenCalledTimes(1);
    expect(rightMove).toHaveBeenCalledTimes(1);

    h.im.destroy();
  });

  it('dispatches pointerdown at the press coordinates, not wherever the pointer ends the frame', () => {
    const h = createHarness();
    const a = sprite(0, 0);

    h.scene.addChild(a);

    const seen: Array<[number, number]> = [];

    a.onPointerDown.add(event => void seen.push([event.x, event.y]));

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);

    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    h.fire('pointermove', { clientX: 300, clientY: 300, buttons: 1 }); // far outside `a`, same frame
    flush(h);

    expect(seen).toEqual([[10, 10]]);

    h.im.destroy();
  });

  it('drags using the move phase coordinate even when a release follows in the same frame', () => {
    const h = createHarness(8);
    const a = sprite(0, 0, 100);

    a.draggable = true;
    h.scene.addChild(a);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    flush(h);

    // One frame: move well past the threshold, then release at a DIFFERENT spot.
    h.fire('pointermove', { clientX: 60, clientY: 10, buttons: 1 });
    h.fire('pointerup', { clientX: 90, clientY: 40, buttons: 0 });
    flush(h);

    // Grabbed at (10,10) on a node at (0,0) → offset (-10,-10). Dragged to
    // (60,10): position = (60,10) + offset = (50,0) - the MOVE coordinate,
    // not the (90,40) release coordinate the same frame ended at.
    expect(a.position.x).toBeCloseTo(50);
    expect(a.position.y).toBeCloseTo(0);

    h.im.destroy();
  });

  it('hit-tests a context-menu request at its own coordinates, independent of a same-frame move', () => {
    const h = createHarness();
    const a = sprite(0, 0);
    const b = sprite(200, 0);

    h.scene.addChild(a);
    h.scene.addChild(b);

    const aMenu = vi.fn();
    const bMove = vi.fn();

    a.onContextMenu.add(aMenu);
    b.onPointerMove.add(bMove);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);

    h.fire('contextmenu', { clientX: 10, clientY: 10 });
    h.fire('pointermove', { clientX: 210, clientY: 10, buttons: 0 });
    flush(h);

    expect(aMenu).toHaveBeenCalledTimes(1);
    expect(bMove).toHaveBeenCalledTimes(1);

    h.im.destroy();
  });
});

describe('painter-order picking under phase-based resolution', () => {
  it('the later sibling wins the press even though an earlier move landed elsewhere', () => {
    const h = createHarness();
    const back = sprite(0, 0, 100);
    const front = sprite(0, 0, 100);

    h.scene.addChild(back);
    h.scene.addChild(front); // added later -> paints above `back` at the same rect

    const backDown = vi.fn();
    const frontDown = vi.fn();

    back.onPointerDown.add(backDown);
    front.onPointerDown.add(frontDown);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    flush(h);

    expect(frontDown).toHaveBeenCalledTimes(1);
    expect(backDown).not.toHaveBeenCalled();

    h.im.destroy();
  });
});

describe('no orphaned drag candidate', () => {
  it('cleans up a drag candidate when its node is removed from the scene mid-press', () => {
    const h = createHarness();
    const a = sprite(0, 0, 100);

    a.draggable = true;
    h.scene.addChild(a);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    flush(h);

    expect(h.im.getCapturedNodes()).toEqual([]); // candidate only, not yet promoted

    h.scene.removeChild(a);

    // A later move must not throw trying to drag a node no longer in the tree,
    // and must not leave the removed node capturing the pointer.
    expect(() => {
      h.fire('pointermove', { clientX: 60, clientY: 10, buttons: 1 });
      flush(h);
    }).not.toThrow();

    expect(h.im.getCapturedNodes()).toEqual([]);

    h.im.destroy();
  });

  it('cleans up an ACTIVE drag (already captured) when its node is removed mid-drag', () => {
    const h = createHarness(8);
    const a = sprite(0, 0, 100);

    a.draggable = true;
    h.scene.addChild(a);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    h.fire('pointermove', { clientX: 60, clientY: 10, buttons: 1 });
    flush(h);

    expect(h.im.getCapturedNodes()).toEqual([a]);

    h.scene.removeChild(a);

    expect(h.im.getCapturedNodes()).toEqual([]);

    expect(() => {
      h.fire('pointermove', { clientX: 90, clientY: 40, buttons: 1 });
      h.fire('pointerup', { clientX: 90, clientY: 40, buttons: 0 });
      flush(h);
    }).not.toThrow();

    h.im.destroy();
  });

  it('clears a removed node out of hover tracking too', () => {
    const h = createHarness();
    const a = sprite(0, 0, 100);

    h.scene.addChild(a);

    // pointerover alone only registers the pointer with InputManager - hover
    // tracking (_lastHit) is driven by an actual dispatched phase, same as a
    // real cursor settling with an immediate pointermove after entering.
    h.fire('pointerover', { clientX: 10, clientY: 10 });
    h.fire('pointermove', { clientX: 10, clientY: 10 });
    flush(h);

    expect(h.im.getHoveredNode()).toBe(a);

    h.scene.removeChild(a);

    expect(h.im.getHoveredNode()).toBeNull();

    h.im.destroy();
  });
});

describe('scoped hit-testing and invisible ancestors', () => {
  it('does not hit inside an active scope whose root is visible but sits under an invisible ancestor', () => {
    const h = createHarness();
    const outerAncestor = new Container();
    const scopeRoot = new Container();
    const a = sprite(0, 0, 100);

    scopeRoot.addChild(a);
    outerAncestor.addChild(scopeRoot);
    h.scene.addChild(outerAncestor);

    outerAncestor.visible = false; // above the scope root, outside the scoped subtree

    const token = h.im.pushScope(scopeRoot);

    const down = vi.fn();

    a.onPointerDown.add(down);

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    flush(h);

    expect(down).not.toHaveBeenCalled();

    h.im.popScope(token);
    h.im.destroy();
  });

  it('hits normally once the ancestor above the scope root becomes visible again', () => {
    const h = createHarness();
    const outerAncestor = new Container();
    const scopeRoot = new Container();
    const a = sprite(0, 0, 100);

    scopeRoot.addChild(a);
    outerAncestor.addChild(scopeRoot);
    h.scene.addChild(outerAncestor);
    outerAncestor.visible = false;

    const token = h.im.pushScope(scopeRoot);

    const down = vi.fn();

    a.onPointerDown.add(down);

    outerAncestor.visible = true;

    h.fire('pointerover', { clientX: 10, clientY: 10 });
    flush(h);
    h.fire('pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    flush(h);

    expect(down).toHaveBeenCalledTimes(1);

    h.im.popScope(token);
    h.im.destroy();
  });
});

describe('context menu: engine-wide fallback', () => {
  it('reaches app.input.onContextMenu even when no scene node is under the pointer', () => {
    const h = createHarness();
    const engineWide = vi.fn();
    const nodeLevel = vi.fn();
    const a = sprite(0, 0, 40);

    a.onContextMenu.add(nodeLevel);
    h.scene.addChild(a);
    h.input.onContextMenu.add(engineWide);

    h.fire('pointerover', { clientX: 500, clientY: 500 }); // well outside `a`
    flush(h);
    h.fire('contextmenu', { clientX: 500, clientY: 500 });
    flush(h);

    expect(engineWide).toHaveBeenCalledTimes(1);
    expect(nodeLevel).not.toHaveBeenCalled();

    h.im.destroy();
  });

  it('reaches app.input.onContextMenu even when no pointer has ever touched the surface', () => {
    const h = createHarness();
    const engineWide = vi.fn();
    const nodeLevel = vi.fn();
    const a = sprite(0, 0, 800);

    a.onContextMenu.add(nodeLevel);
    h.scene.addChild(a);
    h.input.onContextMenu.add(engineWide);

    // No pointerover/pointerdown/pointermove precedes this - the keyboard
    // context-menu key and Shift+F10 fire this same native event with no
    // pointer ever having been tracked.
    h.fire('contextmenu', { clientX: 40, clientY: 50 });
    flush(h);

    expect(engineWide).toHaveBeenCalledTimes(1);
    expect(engineWide.mock.calls[0]![0]).toEqual({ x: 40, y: 50, pointer: null });
    // No pointer to attribute a per-node event to - the scene-graph route
    // stays silent; only the engine-wide fallback fires.
    expect(nodeLevel).not.toHaveBeenCalled();

    h.im.destroy();
  });
});
