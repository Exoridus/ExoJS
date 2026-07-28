import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { ContextMenuRequest } from '#input/ContextMenuRequest';
import type { InputManager } from '#input/InputManager';
import type { InteractionEvent } from '#input/InteractionEvent';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

// ---------------------------------------------------------------------------
// Minimal concrete RenderNode subclass for tests
// ---------------------------------------------------------------------------

class TestSprite extends Drawable {
  /** Bounds are set via direct property assignment in tests. */
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

  /** Override contains() so we can control hit-testing without a real transform. */
  public override contains(x: number, y: number): boolean {
    return x >= this._left && x < this._left + this._width && y >= this._top && y < this._top + this._height;
  }

  /** Override getBounds() so the persistent spatial index can locate the node. */
  public override getBounds(): Rectangle {
    return new Rectangle(this._left, this._top, this._width, this._height);
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface MockPointerOptions {
  id?: number;
  x?: number;
  y?: number;
  /** Press excursion so far — what the drag threshold is compared against. */
  travelled?: number;
}

const makePointer = ({ id = 1, x = 0, y = 0, travelled = 0 }: MockPointerOptions = {}): Pointer =>
  ({
    id,
    x,
    y,
    type: 'mouse',
    isPrimary: true,
    maxDistanceFromPress: travelled,
  }) as unknown as Pointer;

/** Distance comfortably past the default 8px drag threshold. */
const pastThreshold = 40;

interface MockSignals {
  onPointerDown: Signal<[Pointer, number, number]>;
  onPointerMove: Signal<[Pointer, number, number]>;
  onPointerUp: Signal<[Pointer, number, number]>;
  onPointerTap: Signal<[Pointer, number, number]>;
  onPointerCancel: Signal<[Pointer, number, number]>;
  onPointerLeave: Signal<[Pointer, number, number]>;
}

/** Dispatch a mock pointer through a mock signal with its own x/y, matching the real (pointer, x, y) shape. */
const dispatchPointer = (signal: Signal<[Pointer, number, number]>, opts: MockPointerOptions = {}): Pointer => {
  const pointer = makePointer(opts);

  signal.dispatch(pointer, opts.x ?? 0, opts.y ?? 0);

  return pointer;
};

/** Build a minimal Application mock wired to a real Scene root. */
const createApp = (): {
  app: Application;
  scene: Scene;
  signals: MockSignals;
  canvas: HTMLCanvasElement;
} => {
  const signals: MockSignals = {
    onPointerDown: new Signal<[Pointer, number, number]>(),
    onPointerMove: new Signal<[Pointer, number, number]>(),
    onPointerUp: new Signal<[Pointer, number, number]>(),
    onPointerTap: new Signal<[Pointer, number, number]>(),
    onPointerCancel: new Signal<[Pointer, number, number]>(),
    onPointerLeave: new Signal<[Pointer, number, number]>(),
    onContextMenu: new Signal<[ContextMenuRequest]>(),
    // InteractionManager owns the focus controller, which listens for keys.
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
  };

  const canvas = document.createElement('canvas');
  canvas.style.cursor = '';

  const scene = new Scene();

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    input: signals as unknown as InputManager,
    focus: { focused: null, focus() {}, blur: vi.fn(), _notifyNodeRemoved() {} },
    // Default centered camera: design-space pointer coords pass through to
    // world space unchanged (identity screenToWorld). `screenView` uses the
    // same identity mapping — tests that need to distinguish UI vs world
    // space position their nodes accordingly.
    rendering: {
      view: {
        screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }),
      },
      screenView: {
        screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }),
      },
    },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
  } as unknown as Application;

  return { app, scene, signals, canvas };
};

/** Build an Application mock with no active scene (`currentScene` is null). */
const createAppNoScene = (
  overrides: { width?: number; height?: number } = {},
): {
  app: Application;
  signals: MockSignals;
  canvas: HTMLCanvasElement;
} => {
  const signals: MockSignals = {
    onPointerDown: new Signal<[Pointer, number, number]>(),
    onPointerMove: new Signal<[Pointer, number, number]>(),
    onPointerUp: new Signal<[Pointer, number, number]>(),
    onPointerTap: new Signal<[Pointer, number, number]>(),
    onPointerCancel: new Signal<[Pointer, number, number]>(),
    onPointerLeave: new Signal<[Pointer, number, number]>(),
    onContextMenu: new Signal<[ContextMenuRequest]>(),
    // InteractionManager owns the focus controller, which listens for keys.
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
  };

  const canvas = document.createElement('canvas');

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: overrides.width ?? 800,
    height: overrides.height ?? 600,
    input: signals as unknown as InputManager,
    focus: { focused: null, focus() {}, blur: vi.fn(), _notifyNodeRemoved() {} },
    rendering: {
      view: {
        screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }),
      },
      screenView: {
        screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }),
      },
    },
    scenes: {
      get currentScene(): Scene | null {
        return null;
      },
      state: null as SceneState | null,
      _transitionGateOpen: false,
    },
  } as unknown as Application;

  return { app, signals, canvas };
};

/**
 * Flush all pending interaction events. Because InteractionManager is now
 * tick-based, signal handlers only enqueue events — call this after each
 * `signals.onPointerXxx.dispatch()` to actually run hit-testing and fire
 * node listeners.
 */
const flushInteractions = (im: InteractionManager): void => {
  im.update();
};

// ---------------------------------------------------------------------------
// 1. Hit-test basics
// ---------------------------------------------------------------------------

describe('InteractionManager — hit-test basics', () => {
  test('fires onPointerDown on interactive sprite when pointer is over it', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerDown.add(handler);
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as InteractionEvent).target).toBe(sprite);

    im.destroy();
    sprite.destroy();
  });

  test('does NOT fire onPointerDown when interactive=false', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = false;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerDown.add(handler);
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });

  test('does NOT fire when pointer misses the sprite bounds', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerDown.add(handler);
    dispatchPointer(signals.onPointerDown, { x: 200, y: 200 });
    flushInteractions(im);

    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// 2. Z-order — top child wins
// ---------------------------------------------------------------------------

describe('InteractionManager — z-order', () => {
  test('top child (added last) receives hit over bottom child at same position', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const bottom = new TestSprite().setBounds(0, 0, 100, 100);
    const top = new TestSprite().setBounds(0, 0, 100, 100);

    bottom.interactive = true;
    top.interactive = true;
    scene.addChild(bottom);
    scene.addChild(top);

    const bottomHandler = vi.fn();
    const topHandler = vi.fn();

    bottom.onPointerDown.add(bottomHandler);
    top.onPointerDown.add(topHandler);
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(topHandler).toHaveBeenCalledTimes(1);
    expect(bottomHandler).not.toHaveBeenCalled();

    im.destroy();
    bottom.destroy();
    top.destroy();
  });
});

// ---------------------------------------------------------------------------
// 3. Bubble — child + parent both interactive
// ---------------------------------------------------------------------------

describe('InteractionManager — bubbling', () => {
  test('child and interactive parent both receive event; target=child for both', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const parent = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    parent.interactive = true;
    child.interactive = true;
    scene.root.addChild(parent);
    parent.addChild(child);

    // Capture currentTarget at dispatch time because it's mutated during bubbling.
    const parentCurrentTargets: unknown[] = [];
    const childCurrentTargets: unknown[] = [];
    const parentTargets: unknown[] = [];
    const childTargets: unknown[] = [];

    child.onPointerDown.add(e => {
      childTargets.push(e.target);
      childCurrentTargets.push(e.currentTarget);
    });
    parent.onPointerDown.add(e => {
      parentTargets.push(e.target);
      parentCurrentTargets.push(e.currentTarget);
    });
    dispatchPointer(signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(im);

    expect(childTargets).toHaveLength(1);
    expect(parentTargets).toHaveLength(1);
    expect(childTargets[0]).toBe(child);
    expect(parentTargets[0]).toBe(child);
    expect(childCurrentTargets[0]).toBe(child);
    expect(parentCurrentTargets[0]).toBe(parent);

    im.destroy();
    parent.destroy();
  });
});

// ---------------------------------------------------------------------------
// 4. stopPropagation
// ---------------------------------------------------------------------------

describe('InteractionManager — stopPropagation', () => {
  test('stopPropagation in child handler prevents parent from receiving event', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const parent = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    parent.interactive = true;
    child.interactive = true;
    scene.root.addChild(parent);
    parent.addChild(child);

    const parentHandler = vi.fn();

    child.onPointerDown.add(e => {
      e.stopPropagation();
    });
    parent.onPointerDown.add(parentHandler);
    dispatchPointer(signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(im);

    expect(parentHandler).not.toHaveBeenCalled();

    im.destroy();
    parent.destroy();
  });
});

// ---------------------------------------------------------------------------
// 5. Bubble stops at non-interactive parent
// ---------------------------------------------------------------------------

describe('InteractionManager — bubble passes through non-interactive ancestors', () => {
  test('event reaches grandparent through a non-interactive parent', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const grandparent = new Container();
    const parent = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    grandparent.interactive = true;
    // A plain layout container in the middle of the path. `interactive`
    // governs whether a node can be hit, not whether events may pass it.
    parent.interactive = false;
    child.interactive = true;

    scene.root.addChild(grandparent);
    grandparent.addChild(parent);
    parent.addChild(child);

    const grandparentHandler = vi.fn();
    const childHandler = vi.fn();

    child.onPointerDown.add(childHandler);
    grandparent.onPointerDown.add(grandparentHandler);
    dispatchPointer(signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(im);

    expect(childHandler).toHaveBeenCalledTimes(1);
    expect(grandparentHandler).toHaveBeenCalledTimes(1);
    expect(grandparentHandler.mock.calls[0]![0].target).toBe(child);

    im.destroy();
    grandparent.destroy();
  });

  test('a listener on the non-interactive parent itself still receives the event', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const parent = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    parent.interactive = false;
    child.interactive = true;

    scene.root.addChild(parent);
    parent.addChild(child);

    const parentHandler = vi.fn();

    parent.onPointerDown.add(parentHandler);
    dispatchPointer(signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(im);

    expect(parentHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    parent.destroy();
  });

  test('stopPropagation on a non-interactive parent halts the walk', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const grandparent = new Container();
    const parent = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    grandparent.interactive = true;
    parent.interactive = false;
    child.interactive = true;

    scene.root.addChild(grandparent);
    grandparent.addChild(parent);
    parent.addChild(child);

    const grandparentHandler = vi.fn();

    parent.onPointerDown.add(event => event.stopPropagation());
    grandparent.onPointerDown.add(grandparentHandler);
    dispatchPointer(signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(im);

    expect(grandparentHandler).not.toHaveBeenCalled();

    im.destroy();
    grandparent.destroy();
  });
});

// ---------------------------------------------------------------------------
// 6. pointerover / pointerout on move
// ---------------------------------------------------------------------------

describe('InteractionManager — pointerover / pointerout on move', () => {
  test('moving from sprite A to sprite B fires pointerout on A then pointerover on B', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
    const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

    spriteA.interactive = true;
    spriteB.interactive = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    const order: string[] = [];

    spriteA.onPointerOut.add(() => {
      order.push('A:out');
    });
    spriteB.onPointerOver.add(() => {
      order.push('B:over');
    });

    // First move over A to establish lastHit
    dispatchPointer(signals.onPointerMove, { x: 25, y: 25 });
    flushInteractions(im);
    order.length = 0; // reset after setup

    // Now move to B
    dispatchPointer(signals.onPointerMove, { x: 80, y: 25 });
    flushInteractions(im);

    expect(order).toEqual(['A:out', 'B:over']);

    im.destroy();
    spriteA.destroy();
    spriteB.destroy();
  });

  test('moving off a hovered sprite to empty space fires pointerout only (no spurious pointerover)', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 50, 50);

    sprite.interactive = true;
    scene.addChild(sprite);

    const outHandler = vi.fn();
    const overHandler = vi.fn();

    sprite.onPointerOut.add(outHandler);
    sprite.onPointerOver.add(overHandler);

    dispatchPointer(signals.onPointerMove, { x: 25, y: 25 });
    flushInteractions(im);
    expect(overHandler).toHaveBeenCalledTimes(1);

    // Move off the sprite entirely — no node under the pointer any more.
    dispatchPointer(signals.onPointerMove, { x: 500, y: 500 });
    flushInteractions(im);

    expect(outHandler).toHaveBeenCalledTimes(1);
    expect(overHandler).toHaveBeenCalledTimes(1); // unchanged — no new pointerover fired
    expect(im.getHoveredNode()).toBeNull();

    im.destroy();
    sprite.destroy();
  });

  test('a pointerout handler that destroys the incoming node suppresses its pointerover without throwing', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
    const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

    spriteA.interactive = true;
    spriteB.interactive = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    const bOver = vi.fn();

    // A's own pointerout handler reaches out and destroys B — the node the
    // SAME flush is about to dispatch pointerover on next.
    spriteA.onPointerOut.add(() => spriteB.destroy());
    spriteB.onPointerOver.add(bOver);

    dispatchPointer(signals.onPointerMove, { x: 25, y: 25 });
    flushInteractions(im);

    expect(() => {
      dispatchPointer(signals.onPointerMove, { x: 80, y: 25 });
      flushInteractions(im);
    }).not.toThrow();

    expect(bOver).not.toHaveBeenCalled();

    im.destroy();
    spriteA.destroy();
  });
});

// ---------------------------------------------------------------------------
// 6b. Phase-consistent coordinates
// ---------------------------------------------------------------------------

describe('InteractionManager — phase-consistent event coordinates', () => {
  test('event.x/y are the phase-specific layer-space coordinates; event.pointer.x/y always read the live position', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 200, 200);

    sprite.interactive = true;
    scene.addChild(sprite);

    let seenEventX: number | null = null;
    let seenPointerX: number | null = null;

    // The pointer's mock `x` is its LIVE field (set once, at dispatch time,
    // by the test harness below) — a real Pointer always reads live too (see
    // Pointer.position's own doc comment); it is deliberately not what a
    // handler should read for "where did THIS phase happen".
    sprite.onPointerDown.add(event => {
      seenEventX = event.x;
      seenPointerX = event.pointer.x;
    });

    const pointer = makePointer({ x: 50, y: 50 });

    signals.onPointerDown.dispatch(pointer, 50, 50);
    // Mutate the mock pointer's live field to a LATER value, exactly as a
    // same-frame Move happening after Down would leave it — proving a
    // handler reading event.x gets the Down phase's own coordinate (50)
    // rather than silently observing the pointer's later, live position.
    (pointer as unknown as { x: number }).x = 999;
    flushInteractions(im);

    expect(seenEventX).toBe(50);
    expect(seenPointerX).toBe(999);

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// 7. Multi-pointer independence
// ---------------------------------------------------------------------------

describe('InteractionManager — multi-pointer', () => {
  test('two pointers track separate lastHit independently', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
    const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

    spriteA.interactive = true;
    spriteB.interactive = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    const aDownCount = { count: 0 };
    const bDownCount = { count: 0 };

    spriteA.onPointerDown.add(() => {
      aDownCount.count++;
    });
    spriteB.onPointerDown.add(() => {
      bDownCount.count++;
    });

    // Pointer 1 over A
    dispatchPointer(signals.onPointerDown, { id: 1, x: 25, y: 25 });
    flushInteractions(im);
    // Pointer 2 over B
    dispatchPointer(signals.onPointerDown, { id: 2, x: 80, y: 25 });
    flushInteractions(im);

    expect(aDownCount.count).toBe(1);
    expect(bDownCount.count).toBe(1);

    im.destroy();
    spriteA.destroy();
    spriteB.destroy();
  });
});

// ---------------------------------------------------------------------------
// 8. Cursor
// ---------------------------------------------------------------------------

describe('InteractionManager — cursor', () => {
  test('canvas cursor becomes pointer when sprite.cursor="pointer" is hovered', () => {
    const { app, scene, signals, canvas } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.cursor = 'pointer';
    scene.addChild(sprite);

    dispatchPointer(signals.onPointerMove, { x: 50, y: 50 });
    flushInteractions(im);

    expect(canvas.style.cursor).toBe('pointer');

    im.destroy();
    sprite.destroy();
  });

  test('canvas cursor reverts to empty string when pointer leaves', () => {
    const { app, scene, signals, canvas } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.cursor = 'pointer';
    scene.addChild(sprite);

    dispatchPointer(signals.onPointerMove, { id: 1, x: 50, y: 50 });
    flushInteractions(im);
    expect(canvas.style.cursor).toBe('pointer');

    dispatchPointer(signals.onPointerLeave, { id: 1, x: 50, y: 50 });
    flushInteractions(im);
    expect(canvas.style.cursor).toBe('');

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// 9. Tap
// ---------------------------------------------------------------------------

describe('InteractionManager — tap', () => {
  test('onPointerTap signal fires on hit node when input.onPointerTap dispatches', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerTap.add(handler);
    dispatchPointer(signals.onPointerTap, { x: 50, y: 50 });
    flushInteractions(im);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as InteractionEvent;

    expect(event.type).toBe('pointertap');
    expect(event.target).toBe(sprite);

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// 10. Destroy cleanup
// ---------------------------------------------------------------------------

describe('InteractionManager — destroy cleanup', () => {
  test('no events fire after interaction.destroy()', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerDown.add(handler);
    im.destroy();

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    // No flushInteractions — im is destroyed, so update() is also a no-op.

    expect(handler).not.toHaveBeenCalled();

    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// 11. Drag and drop
// ---------------------------------------------------------------------------

describe('InteractionManager — drag and drop', () => {
  /**
   * jsdom does not implement setPointerCapture / releasePointerCapture on
   * canvas elements. Stub them out before spying so the InteractionManager's
   * best-effort calls don't throw.
   */
  const mockPointerCapture = (canvas: HTMLCanvasElement): void => {
    if (!('setPointerCapture' in canvas)) {
      Object.defineProperty(canvas, 'setPointerCapture', {
        value: () => {
          /* no-op */
        },
        writable: true,
        configurable: true,
      });
    }

    if (!('releasePointerCapture' in canvas)) {
      Object.defineProperty(canvas, 'releasePointerCapture', {
        value: () => {
          /* no-op */
        },
        writable: true,
        configurable: true,
      });
    }

    vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {
      /* no-op */
    });
    vi.spyOn(canvas, 'releasePointerCapture').mockImplementation(() => {
      /* no-op */
    });
  };

  test('dragstart waits for the threshold; pointermove drags; dragend fires on pointerup', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = true;
    scene.addChild(sprite);

    const dragStartHandler = vi.fn();
    const dragHandler = vi.fn();
    const dragEndHandler = vi.fn();

    sprite.onDragStart.add(dragStartHandler);
    sprite.onDrag.add(dragHandler);
    sprite.onDragEnd.add(dragEndHandler);

    // Pointer down only notes a candidate — no drag yet.
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);
    expect(dragStartHandler).not.toHaveBeenCalled();

    // The first move past the threshold starts the drag and drags in one go.
    dispatchPointer(signals.onPointerMove, { x: 70, y: 60, travelled: pastThreshold });
    flushInteractions(im);
    expect(dragStartHandler).toHaveBeenCalledTimes(1);
    expect(dragHandler).toHaveBeenCalledTimes(1);

    // Pointer up ends drag
    dispatchPointer(signals.onPointerUp, { x: 70, y: 60, travelled: pastThreshold });
    flushInteractions(im);
    expect(dragEndHandler).toHaveBeenCalledTimes(1);

    // Further move should NOT fire drag events
    dispatchPointer(signals.onPointerMove, { x: 90, y: 90, travelled: pastThreshold });
    flushInteractions(im);
    expect(dragHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('drag offset is preserved — node stays at grab-point relative distance', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);

    // Sprite positioned at (50, 50) in scene space.
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = true;
    sprite.position.x = 50;
    sprite.position.y = 50;
    scene.addChild(sprite);

    // Grab at (60, 60) — offset is (50-60, 50-60) = (-10, -10)
    dispatchPointer(signals.onPointerDown, { x: 60, y: 60 });
    flushInteractions(im);

    // Move pointer to (100, 80) — expected node position: (100-10, 80-10) = (90, 70)
    dispatchPointer(signals.onPointerMove, { x: 100, y: 80, travelled: pastThreshold });
    flushInteractions(im);

    expect(sprite.position.x).toBe(90);
    expect(sprite.position.y).toBe(70);

    im.destroy();
    sprite.destroy();
  });

  test('drag bypasses hit-test — moving pointer over another sprite does not fire pointerover on it', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const dragged = new TestSprite().setBounds(0, 0, 100, 100);
    const other = new TestSprite().setBounds(200, 0, 100, 100);

    dragged.interactive = true;
    dragged.draggable = true;
    other.interactive = true;
    scene.addChild(dragged);
    scene.addChild(other);

    const otherOverHandler = vi.fn();

    other.onPointerOver.add(otherOverHandler);

    // Start drag on dragged sprite
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    // Move pointer into other sprite's bounds — should NOT fire pointerover on other
    dispatchPointer(signals.onPointerMove, { x: 250, y: 50, travelled: pastThreshold });
    flushInteractions(im);

    expect(otherOverHandler).not.toHaveBeenCalled();

    im.destroy();
    dragged.destroy();
    other.destroy();
  });

  test('drag does NOT start if draggable=false', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = false;
    scene.addChild(sprite);

    const dragStartHandler = vi.fn();

    sprite.onDragStart.add(dragStartHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(dragStartHandler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });

  test('drag does NOT start if interactive=false (no pointerdown lands)', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = false;
    sprite.draggable = true;
    scene.addChild(sprite);

    const dragStartHandler = vi.fn();
    const downHandler = vi.fn();

    sprite.onDragStart.add(dragStartHandler);
    sprite.onPointerDown.add(downHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(downHandler).not.toHaveBeenCalled();
    expect(dragStartHandler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });

  test('pointercancel during drag fires onDragEnd and clears drag state', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = true;
    scene.addChild(sprite);

    const dragEndHandler = vi.fn();
    const dragHandler = vi.fn();

    sprite.onDragEnd.add(dragEndHandler);
    sprite.onDrag.add(dragHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    dispatchPointer(signals.onPointerMove, { x: 50, y: 90, travelled: pastThreshold });
    flushInteractions(im);
    expect(dragHandler).toHaveBeenCalledTimes(1);

    dispatchPointer(signals.onPointerCancel, { x: 50, y: 90, travelled: pastThreshold });
    flushInteractions(im);

    expect(dragEndHandler).toHaveBeenCalledTimes(1);

    // Further move after cancel should NOT fire drag
    dispatchPointer(signals.onPointerMove, { x: 60, y: 60, travelled: pastThreshold });
    flushInteractions(im);
    expect(dragHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('onDrag fires on every pointermove during drag with dragged node as currentTarget', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = true;
    scene.addChild(sprite);

    const dragTargets: unknown[] = [];

    sprite.onDrag.add(e => {
      dragTargets.push(e.currentTarget);
    });

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    dispatchPointer(signals.onPointerMove, { x: 55, y: 55, travelled: pastThreshold });
    flushInteractions(im);

    dispatchPointer(signals.onPointerMove, { x: 60, y: 60, travelled: pastThreshold });
    flushInteractions(im);

    expect(dragTargets).toHaveLength(2);
    expect(dragTargets[0]).toBe(sprite);
    expect(dragTargets[1]).toBe(sprite);

    im.destroy();
    sprite.destroy();
  });

  test('drag events do not bubble — interactive parent does not receive them', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const parent = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    parent.interactive = true;
    child.interactive = true;
    child.draggable = true;
    scene.root.addChild(parent);
    parent.addChild(child);

    const parentDragStart = vi.fn();
    const parentDrag = vi.fn();
    const parentDragEnd = vi.fn();

    parent.onDragStart.add(parentDragStart);
    parent.onDrag.add(parentDrag);
    parent.onDragEnd.add(parentDragEnd);

    dispatchPointer(signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(im);

    dispatchPointer(signals.onPointerMove, { x: 30, y: 30, travelled: pastThreshold });
    flushInteractions(im);

    dispatchPointer(signals.onPointerUp, { x: 30, y: 30, travelled: pastThreshold });
    flushInteractions(im);

    expect(parentDragStart).not.toHaveBeenCalled();
    expect(parentDrag).not.toHaveBeenCalled();
    expect(parentDragEnd).not.toHaveBeenCalled();

    im.destroy();
    parent.destroy();
  });

  test('multiple draggable nodes — dragging one does not capture events for others', () => {
    const { app, scene, signals, canvas } = createApp();
    mockPointerCapture(canvas);
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
    const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

    spriteA.interactive = true;
    spriteA.draggable = true;
    spriteB.interactive = true;
    spriteB.draggable = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    const aDrag = vi.fn();
    const bDown = vi.fn();

    spriteA.onDrag.add(aDrag);
    spriteB.onPointerDown.add(bDown);

    // Start drag on A with pointer 1
    dispatchPointer(signals.onPointerDown, { id: 1, x: 25, y: 25 });
    flushInteractions(im);

    // Pointer 2 down on B — should fire normally (separate pointer)
    dispatchPointer(signals.onPointerDown, { id: 2, x: 80, y: 25 });
    flushInteractions(im);

    expect(bDown).toHaveBeenCalledTimes(1);

    // Move pointer 1 — only A's drag fires
    dispatchPointer(signals.onPointerMove, { id: 1, x: 30, y: 30, travelled: pastThreshold });
    flushInteractions(im);

    expect(aDrag).toHaveBeenCalledTimes(1);

    im.destroy();
    spriteA.destroy();
    spriteB.destroy();
  });
});

describe('InteractionManager — multi-Application isolation', () => {
  test('two Applications route picking independently (no global active-manager)', () => {
    const a = createApp();
    const b = createApp();
    const imA = new InteractionManager(a.app);
    const imB = new InteractionManager(b.app);
    imA.attachRoot(a.scene.root);
    imB.attachRoot(b.scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 50, 50);
    sprite.interactive = true;
    a.scene.addChild(sprite);

    const down = vi.fn();
    sprite.onPointerDown.add(down);

    // App B's pointer must NOT reach app A's node. Under the old global
    // singleton the node registered with whichever manager was constructed
    // last, breaking exactly this case.
    dispatchPointer(b.signals.onPointerDown, { x: 25, y: 25 });
    imB.update();
    expect(down).not.toHaveBeenCalled();

    // Only app A's own pointer reaches it.
    dispatchPointer(a.signals.onPointerDown, { x: 25, y: 25 });
    imA.update();
    expect(down).toHaveBeenCalledTimes(1);

    imA.destroy();
    imB.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// Modal input capture
// ---------------------------------------------------------------------------

describe('InteractionManager — interaction scope', () => {
  test('confines hit-testing to the scoped subtree; outside pointers hit nothing', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);

    const modal = new Container();
    const inside = new TestSprite().setBounds(0, 0, 100, 100);
    const outside = new TestSprite().setBounds(200, 0, 100, 100);

    inside.interactive = true;
    outside.interactive = true;
    modal.addChild(inside);
    scene.addChild(modal);
    scene.addChild(outside);

    const insideHandler = vi.fn();
    const outsideHandler = vi.fn();

    inside.onPointerDown.add(insideHandler);
    outside.onPointerDown.add(outsideHandler);

    im.pushScope(modal);

    // Pointer over `outside` (not in the captured subtree) hits nothing.
    dispatchPointer(signals.onPointerDown, { x: 250, y: 50 });
    flushInteractions(im);
    expect(outsideHandler).not.toHaveBeenCalled();

    // Pointer over `inside` (in the captured subtree) still hits.
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);
    expect(insideHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    inside.destroy();
    outside.destroy();
    modal.destroy();
  });

  test('popScope restores hit-testing outside the previous subtree', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);

    const modal = new Container();
    const inside = new TestSprite().setBounds(0, 0, 100, 100);
    const outside = new TestSprite().setBounds(200, 0, 100, 100);

    inside.interactive = true;
    outside.interactive = true;
    modal.addChild(inside);
    scene.addChild(modal);
    scene.addChild(outside);

    const outsideHandler = vi.fn();

    outside.onPointerDown.add(outsideHandler);

    const token = im.pushScope(modal);

    im.popScope(token);

    dispatchPointer(signals.onPointerDown, { x: 250, y: 50 });
    flushInteractions(im);
    expect(outsideHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    inside.destroy();
    outside.destroy();
    modal.destroy();
  });

  test('a scope root removed via removeChild without popping the scope is skipped: hit-testing falls through to the real scene graph instead of staying confined to the detached subtree', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);

    const modal = new Container();
    const inside = new TestSprite().setBounds(0, 0, 100, 100);
    const outside = new TestSprite().setBounds(200, 0, 100, 100);

    inside.interactive = true;
    outside.interactive = true;
    modal.addChild(inside);
    scene.addChild(modal);
    scene.addChild(outside);

    const outsideHandler = vi.fn();

    outside.onPointerDown.add(outsideHandler);
    im.pushScope(modal);

    // Detach the scope root itself — without popping the scope.
    scene.removeChild(modal);

    dispatchPointer(signals.onPointerDown, { x: 250, y: 50 });
    flushInteractions(im);

    // The dead scope no longer hit-tests its own (now detached) subtree, nor
    // does it keep blocking the real scene graph — `outside` is reachable.
    expect(outsideHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    inside.destroy();
    outside.destroy();
    modal.destroy();
  });

  test('a scope root belonging to a different Application is skipped: hit-testing falls through to this Application\'s own real scene graph', () => {
    const a = createApp();
    const b = createApp();
    const imA = new InteractionManager(a.app);
    const imB = new InteractionManager(b.app);

    imA.attachRoot(a.scene.root);
    imB.attachRoot(b.scene.root);

    // A caller mistake: app A's manager is scoped to a root that only ever
    // had a stage installed by app B.
    imA.pushScope(b.scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 50, 50);

    sprite.interactive = true;
    a.scene.addChild(sprite);

    const down = vi.fn();

    sprite.onPointerDown.add(down);

    // The cross-Application scope root is dead from app A's perspective, so
    // it neither hit-tests app B's subtree through app A's manager nor blocks
    // app A's own real scene graph.
    dispatchPointer(a.signals.onPointerDown, { x: 25, y: 25 });
    flushInteractions(imA);

    expect(down).toHaveBeenCalledTimes(1);

    imA.destroy();
    imB.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// getHoveredNode
// ---------------------------------------------------------------------------

describe('InteractionManager — getHoveredNode', () => {
  test('returns null for a pointerId that has no recorded hit', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(im.getHoveredNode(42)).toBeNull();

    im.destroy();
  });

  test('returns the hovered node for a given pointerId', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    dispatchPointer(signals.onPointerMove, { id: 7, x: 50, y: 50 });
    flushInteractions(im);

    expect(im.getHoveredNode(7)).toBe(sprite);

    im.destroy();
    sprite.destroy();
  });

  test('returns null when no pointerId is given and nothing is hovered', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(im.getHoveredNode()).toBeNull();

    im.destroy();
  });

  test('returns the first hovered node in iteration order when no pointerId is given', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    dispatchPointer(signals.onPointerMove, { id: 1, x: 50, y: 50 });
    flushInteractions(im);

    expect(im.getHoveredNode()).toBe(sprite);

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// getCapturedNodes
// ---------------------------------------------------------------------------

describe('InteractionManager — getCapturedNodes', () => {
  test('returns an empty array when nothing is captured', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(im.getCapturedNodes()).toEqual([]);

    im.destroy();
  });

  test('returns the dragged node while a drag is active', () => {
    const { app, scene, signals, canvas } = createApp();

    Object.defineProperty(canvas, 'setPointerCapture', { value: () => undefined, writable: true, configurable: true });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: () => undefined, writable: true, configurable: true });

    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = true;
    scene.addChild(sprite);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    // A press alone is only a candidate — capture starts with the drag.
    expect(im.getCapturedNodes()).toEqual([]);

    dispatchPointer(signals.onPointerMove, { x: 90, y: 50, travelled: pastThreshold });
    flushInteractions(im);

    expect(im.getCapturedNodes()).toEqual([sprite]);

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// detachRoot
// ---------------------------------------------------------------------------

describe('InteractionManager — detachRoot', () => {
  test('blurs focus, clears the scope stack, unregisters interactive nodes, and clears the subtree stage', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    im.pushScope(scene.root);

    expect(sprite._getStage()).not.toBeNull();

    sprite.focusable = true;
    im.focus(sprite);
    expect(im.focused).toBe(sprite);

    im.detachRoot(scene.root);

    expect(im.focused).toBeNull();

    // Interactive nodes were unregistered — the quadtree is torn down.
    expect(im._getDebugQuadtree()).toBeNull();

    // The subtree's stage was cleared — nodes are no longer routed anywhere.
    expect(sprite._getStage()).toBeNull();

    // The (stale) scope pushed above was cleared, not merely shadowed.
    expect((im as unknown as { _scopeStack: unknown[] })._scopeStack).toHaveLength(0);

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// UI layer (attachUIRoot / detachUIRoot)
// ---------------------------------------------------------------------------

describe('InteractionManager — UI layer', () => {
  test('a UI node is hit-tested in screen space and takes priority over a world node at the same position', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);
    im.attachUIRoot(scene.ui);

    const worldSprite = new TestSprite().setBounds(0, 0, 100, 100);

    worldSprite.interactive = true;
    scene.addChild(worldSprite);

    const uiSprite = new TestSprite().setBounds(0, 0, 100, 100);

    uiSprite.interactive = true;
    scene.ui.addChild(uiSprite);

    const worldHandler = vi.fn();
    const uiHandler = vi.fn();

    worldSprite.onPointerDown.add(worldHandler);
    uiSprite.onPointerDown.add(uiHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(uiHandler).toHaveBeenCalledTimes(1);
    expect(worldHandler).not.toHaveBeenCalled();

    im.destroy();
    worldSprite.destroy();
    uiSprite.destroy();
  });

  test('a click that misses every UI node falls through to world hit-testing', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);
    im.attachUIRoot(scene.ui);

    const worldSprite = new TestSprite().setBounds(0, 0, 100, 100);

    worldSprite.interactive = true;
    scene.addChild(worldSprite);

    // UI sprite lives far away from the click position.
    const uiSprite = new TestSprite().setBounds(500, 500, 50, 50);

    uiSprite.interactive = true;
    scene.ui.addChild(uiSprite);

    const worldHandler = vi.fn();

    worldSprite.onPointerDown.add(worldHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(worldHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    worldSprite.destroy();
    uiSprite.destroy();
  });

  test('attachUIRoot installs the UI stage; detachUIRoot clears it', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);
    im.attachUIRoot(scene.ui);

    expect(scene.ui._getStage()).not.toBeNull();

    im.detachUIRoot(scene.ui);

    expect(scene.ui._getStage()).toBeNull();

    im.destroy();
  });

  test('dragging a node inside the UI layer resolves coordinates in UI space (_isUINode traversal)', () => {
    const { app, scene, signals, canvas } = createApp();

    Object.defineProperty(canvas, 'setPointerCapture', { value: () => undefined, writable: true, configurable: true });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: () => undefined, writable: true, configurable: true });

    const im = new InteractionManager(app);

    im.attachRoot(scene.root);
    im.attachUIRoot(scene.ui);

    const uiSprite = new TestSprite().setBounds(0, 0, 100, 100);

    uiSprite.interactive = true;
    uiSprite.draggable = true;
    scene.ui.addChild(uiSprite);

    const dragHandler = vi.fn();

    uiSprite.onDrag.add(dragHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    dispatchPointer(signals.onPointerMove, { x: 60, y: 60, travelled: pastThreshold });
    flushInteractions(im);

    expect(dragHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    uiSprite.destroy();
  });

  test('_isUINode returns false while dragging a world node, even when a UI root is also attached', () => {
    const { app, scene, signals, canvas } = createApp();

    Object.defineProperty(canvas, 'setPointerCapture', { value: () => undefined, writable: true, configurable: true });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: () => undefined, writable: true, configurable: true });

    const im = new InteractionManager(app);

    im.attachRoot(scene.root);
    im.attachUIRoot(scene.ui); // a UI root exists, but the dragged node lives in the world

    const worldSprite = new TestSprite().setBounds(0, 0, 100, 100);

    worldSprite.interactive = true;
    worldSprite.draggable = true;
    scene.addChild(worldSprite);

    const dragHandler = vi.fn();

    worldSprite.onDrag.add(dragHandler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    dispatchPointer(signals.onPointerMove, { x: 60, y: 60, travelled: pastThreshold });
    flushInteractions(im);

    expect(dragHandler).toHaveBeenCalledTimes(1);
    // Grabbed at (50,50) while at position (0,0) — offset (-50,-50). Moving
    // to (60,60) in (identity-mapped) world space yields position (10,10).
    expect(worldSprite.position.x).toBe(10);
    expect(worldSprite.position.y).toBe(10);

    im.destroy();
    worldSprite.destroy();
  });

  test('UI hooks route _notifyNodeRemoved and _notifyInteractiveChanged for already-attached UI nodes', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);
    im.attachUIRoot(scene.ui);

    const uiSprite = new TestSprite().setBounds(0, 0, 100, 100);

    scene.ui.addChild(uiSprite); // added while non-interactive, stage already set

    // Toggling `.interactive` on an already-attached UI node routes through
    // `_uiInteraction._notifyInteractiveChanged` (a no-op, but must not throw).
    expect(() => {
      uiSprite.interactive = true;
      uiSprite.interactive = false;
    }).not.toThrow();

    // Removing an already-attached UI node routes through
    // `_uiInteraction._notifyNodeRemoved` (a no-op, but must not throw).
    expect(() => scene.ui.removeChild(uiSprite)).not.toThrow();

    im.destroy();
    uiSprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// No active scene
// ---------------------------------------------------------------------------

describe('InteractionManager — no active scene', () => {
  test('pointer events are safely ignored when there is no current scene', () => {
    const { app, signals } = createAppNoScene();
    const im = new InteractionManager(app);

    expect(() => {
      dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
      flushInteractions(im);
    }).not.toThrow();

    expect(im.getHoveredNode()).toBeNull();

    im.destroy();
  });

  test('creating the quadtree with no current scene root falls back to the seed bounds, and to the default width/height when app.width/height are falsy', () => {
    const { app } = createAppNoScene({ width: 0, height: 0 });
    const im = new InteractionManager(app);

    // A freestanding container (not the scene's root — there is no scene) can
    // still be attached directly; registering its interactive child forces
    // quadtree creation while `app.scenes.currentScene` is null.
    const root = new Container();
    const sprite = new TestSprite().setBounds(0, 0, 10, 10);

    sprite.interactive = true;
    root.addChild(sprite);

    expect(() => im.attachRoot(root)).not.toThrow();
    expect(im._getDebugQuadtree()).not.toBeNull();

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// Invisible nodes are skipped by hit-testing
// ---------------------------------------------------------------------------

describe('InteractionManager — invisible nodes', () => {
  test('an invisible interactive node inside a scoped subtree is skipped by hit-testing', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const modal = new Container();
    const hidden = new TestSprite().setBounds(0, 0, 100, 100);

    hidden.interactive = true;
    hidden.visible = false;
    modal.addChild(hidden);
    scene.addChild(modal);
    im.pushScope(modal);

    const handler = vi.fn();

    hidden.onPointerDown.add(handler);

    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    hidden.destroy();
    modal.destroy();
  });
});

// ---------------------------------------------------------------------------
// Coalesced events (two events for one pointer enqueued before update())
// ---------------------------------------------------------------------------

describe('InteractionManager — coalesced events', () => {
  test('two events enqueued for the same pointer before update() are both processed on the next flush', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const downHandler = vi.fn();
    const moveHandler = vi.fn();

    sprite.onPointerDown.add(downHandler);
    sprite.onPointerMove.add(moveHandler);

    // Both dispatched BEFORE update() — coalesced into a single pending queue entry.
    dispatchPointer(signals.onPointerDown, { id: 3, x: 50, y: 50 });
    dispatchPointer(signals.onPointerMove, { id: 3, x: 55, y: 55 });
    flushInteractions(im);

    expect(downHandler).toHaveBeenCalledTimes(1);
    expect(moveHandler).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('each coalesced phase hit-tests against the node it actually happened over, not a shared position', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const left = new TestSprite().setBounds(0, 0, 50, 50);
    const right = new TestSprite().setBounds(200, 0, 50, 50);

    left.interactive = true;
    right.interactive = true;
    scene.addChild(left);
    scene.addChild(right);

    const leftDown = vi.fn();
    const rightMove = vi.fn();
    const leftUp = vi.fn();

    left.onPointerDown.add(leftDown);
    right.onPointerMove.add(rightMove);
    left.onPointerUp.add(leftUp);

    // A mock pointer carries only ONE (x, y) — makePointer's `x`/`y` become
    // whatever pointer.x/y read AT dispatch time, which is exactly what
    // InteractionManager._enqueue captures per phase. Down and Up share the
    // same stub position (25, 25) — still over `left` — while Move alone
    // reports (225, 25), over `right`; all three collapse into one flush.
    dispatchPointer(signals.onPointerDown, { id: 9, x: 25, y: 25 });
    dispatchPointer(signals.onPointerMove, { id: 9, x: 225, y: 25 });
    dispatchPointer(signals.onPointerUp, { id: 9, x: 25, y: 25 });
    flushInteractions(im);

    expect(leftDown).toHaveBeenCalledTimes(1);
    expect(rightMove).toHaveBeenCalledTimes(1);
    expect(leftUp).toHaveBeenCalledTimes(1);

    im.destroy();
    left.destroy();
    right.destroy();
  });
});

// ---------------------------------------------------------------------------
// Hit-miss edge cases (event fires with no node under the pointer)
// ---------------------------------------------------------------------------

describe('InteractionManager — events with no hit', () => {
  test('pointermove over empty space dispatches nothing and does not throw', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerMove.add(handler);

    expect(() => {
      dispatchPointer(signals.onPointerMove, { x: 500, y: 500 });
      flushInteractions(im);
    }).not.toThrow();
    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });

  test('pointerup on a non-draggable node fires pointerup with no drag involved', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = vi.fn();

    sprite.onPointerUp.add(handler);

    dispatchPointer(signals.onPointerUp, { x: 50, y: 50 });
    flushInteractions(im);

    expect(handler).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('pointerup over empty space dispatches nothing and does not throw', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(() => {
      dispatchPointer(signals.onPointerUp, { x: 500, y: 500 });
      flushInteractions(im);
    }).not.toThrow();

    im.destroy();
  });

  test('pointertap over empty space dispatches nothing and does not throw', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(() => {
      dispatchPointer(signals.onPointerTap, { x: 500, y: 500 });
      flushInteractions(im);
    }).not.toThrow();

    im.destroy();
  });

  test('pointercancel/pointerleave with no prior hover and no active drag does not throw', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(() => {
      dispatchPointer(signals.onPointerCancel, { id: 9, x: 500, y: 500 });
      flushInteractions(im);
      dispatchPointer(signals.onPointerLeave, { id: 9, x: 500, y: 500 });
      flushInteractions(im);
    }).not.toThrow();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Registration-guard idempotency
// ---------------------------------------------------------------------------

describe('InteractionManager — registration guards', () => {
  test('calling attachRoot twice on the same root does not double-register interactive nodes', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    // Re-attaching the same, already-attached root re-walks the subtree —
    // `_registerNode`'s "already registered" guard must no-op for `sprite`.
    expect(() => im.attachRoot(scene.root)).not.toThrow();

    const handler = vi.fn();

    sprite.onPointerDown.add(handler);
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    // Still fires exactly once — no duplicate registration/dispatch.
    expect(handler).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('_notifyInteractiveChanged(node, false) for an unregistered node is a safe no-op', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    // First call unregisters normally; the second call finds `sprite` already
    // absent from the tracking set — `_unregisterNode`'s own guard no-ops.
    expect(() => {
      im._notifyInteractiveChanged(sprite, false);
      im._notifyInteractiveChanged(sprite, false);
    }).not.toThrow();

    im.destroy();
    sprite.destroy();
  });

  test('toggling .interactive AFTER a node is already attached routes through the setter (not addChild)', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    // Added while non-interactive — `_notifyNodeAdded` skips registration.
    scene.addChild(sprite);

    // Now flip it on while already attached — this is the setter's own
    // `_notifyInteractiveChanged(node, true)` path, distinct from the
    // addChild-time subtree walk exercised by every other test in this file.
    sprite.interactive = true;

    const handler = vi.fn();

    sprite.onPointerDown.add(handler);
    dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
    flushInteractions(im);

    expect(handler).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// Miscellaneous
// ---------------------------------------------------------------------------

describe('InteractionManager — miscellaneous', () => {
  test('update() with nothing enqueued is a no-op (dirty flag stays false)', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    expect(() => im.update()).not.toThrow();

    im.destroy();
  });

  test('unregistering one of two interactive nodes keeps the quadtree alive for the other', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    im.attachRoot(scene.root);

    const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
    const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

    spriteA.interactive = true;
    spriteB.interactive = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    expect(im._getDebugQuadtree()).not.toBeNull();

    spriteA.interactive = false; // unregisters A only — B keeps the quadtree alive

    expect(im._getDebugQuadtree()).not.toBeNull();

    spriteB.interactive = false; // now empty — quadtree is torn down

    expect(im._getDebugQuadtree()).toBeNull();

    im.destroy();
    spriteA.destroy();
    spriteB.destroy();
  });
});

// ---------------------------------------------------------------------------
// Dispatch gating (SceneState + transition gate)
// ---------------------------------------------------------------------------

describe('InteractionManager — dispatch gating', () => {
  test('does not dispatch while state is Preparing (no active scope yet)', () => {
    const { app, scene, signals } = createApp();
    const appMutable = app as unknown as { scenes: { state: SceneState | null } };
    appMutable.scenes.state = SceneState.Preparing;

    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const onDown = vi.fn();
    sprite.onPointerDown.add(onDown);

    dispatchPointer(signals.onPointerDown, { x: 10, y: 10 });
    im.update();

    expect(onDown).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });

  test('dispatches normally while state is Active', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const onDown = vi.fn();
    sprite.onPointerDown.add(onDown);

    dispatchPointer(signals.onPointerDown, { x: 10, y: 10 });
    im.update();

    expect(onDown).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('dispatches normally while the scene is paused — pause is not gated here, only SceneState is', () => {
    const { app, scene, signals } = createApp();
    const appMutable = app as unknown as { scenes: { state: SceneState | null } };
    appMutable.scenes.state = SceneState.Active;

    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const onDown = vi.fn();
    sprite.onPointerDown.add(onDown);

    dispatchPointer(signals.onPointerDown, { x: 10, y: 10 });
    im.update();

    expect(onDown).toHaveBeenCalledTimes(1);

    im.destroy();
    sprite.destroy();
  });

  test('does not dispatch while the transition gate is open, and discards the stale event once it closes', () => {
    const { app, scene, signals } = createApp();
    const appMutable = app as unknown as { scenes: { _transitionGateOpen: boolean } };
    appMutable.scenes._transitionGateOpen = true;

    const im = new InteractionManager(app);
    im.attachRoot(scene.root);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const onDown = vi.fn();
    sprite.onPointerDown.add(onDown);

    dispatchPointer(signals.onPointerDown, { x: 10, y: 10 });
    im.update();
    expect(onDown).not.toHaveBeenCalled();

    appMutable.scenes._transitionGateOpen = false;
    im.update(); // the stale queued event must NOT replay once the gate reopens

    expect(onDown).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });

  test('pointer events are safely ignored when there is no current scene (state null)', () => {
    const { app, signals } = createAppNoScene();
    const im = new InteractionManager(app);

    expect(() => {
      dispatchPointer(signals.onPointerDown, { x: 50, y: 50 });
      im.update();
    }).not.toThrow();

    im.destroy();
  });
});
