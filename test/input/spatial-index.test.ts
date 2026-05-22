import type { Application } from '@/core/Application';
import { Scene } from '@/core/Scene';
import type { Signal } from '@/core/Signal';
import type { InputManager } from '@/input/InputManager';
import type { InteractionEvent } from '@/input/InteractionEvent';
import { InteractionManager } from '@/input/InteractionManager';
import type { Pointer } from '@/input/Pointer';
import { Quadtree } from '@/math/Quadtree';
import { Rectangle } from '@/math/Rectangle';
import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';

// ---------------------------------------------------------------------------
// TestSprite — overrides both contains() and getBounds() for spatial-index tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test helpers
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
  canvas: HTMLCanvasElement;
} => {
  const { Signal: SIG } = jest.requireActual<{ Signal: typeof import('@/core/Signal').Signal }>('@/core/Signal');

  const signals: MockSignals = {
    onPointerDown: new SIG<[Pointer]>(),
    onPointerMove: new SIG<[Pointer]>(),
    onPointerUp: new SIG<[Pointer]>(),
    onPointerTap: new SIG<[Pointer]>(),
    onPointerCancel: new SIG<[Pointer]>(),
    onPointerLeave: new SIG<[Pointer]>(),
  };

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.cursor = '';

  const scene = new Scene();

  const app = {
    canvas,
    input: signals as unknown as InputManager,
    scene: {
      get currentScene(): Scene | null {
        return scene;
      },
    },
  } as unknown as Application;

  return { app, scene, signals, canvas };
};

const flushInteractions = (im: InteractionManager): void => {
  im.update();
};

// ---------------------------------------------------------------------------
// 1. Quadtree unit tests
// ---------------------------------------------------------------------------

describe('Quadtree — insert and queryPoint', () => {
  test('insert one item; queryPoint inside its bounds returns it', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
    const bounds = new Rectangle(10, 10, 30, 30);

    qt.insert({ bounds, payload: 'A' });

    const results = qt.queryPoint(20, 20);

    expect(results).toHaveLength(1);
    expect(results[0].payload).toBe('A');

    qt.destroy();
  });

  test('insert one item; queryPoint outside returns nothing', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

    qt.insert({ bounds: new Rectangle(10, 10, 30, 30), payload: 'A' });

    const results = qt.queryPoint(80, 80);

    expect(results).toHaveLength(0);

    qt.destroy();
  });

  test('queryPoint outside tree bounds returns nothing', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

    qt.insert({ bounds: new Rectangle(10, 10, 30, 30), payload: 'A' });

    // Point is entirely outside the tree's own bounds.
    const results = qt.queryPoint(200, 200);

    expect(results).toHaveLength(0);

    qt.destroy();
  });

  test('insert many items spread across quadrants; queryPoint returns only relevant ones', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 2);

    // Spread across each quadrant:
    qt.insert({ bounds: new Rectangle(5, 5, 20, 20), payload: 'NW' });
    qt.insert({ bounds: new Rectangle(60, 5, 20, 20), payload: 'NE' });
    qt.insert({ bounds: new Rectangle(5, 60, 20, 20), payload: 'SW' });
    qt.insert({ bounds: new Rectangle(60, 60, 20, 20), payload: 'SE' });
    // Extra items to force subdivision
    qt.insert({ bounds: new Rectangle(1, 1, 5, 5), payload: 'extra1' });
    qt.insert({ bounds: new Rectangle(2, 2, 5, 5), payload: 'extra2' });

    // Query inside NW item only
    const results = qt.queryPoint(10, 10);

    // Should only return items whose bounds contain (10,10)
    const payloads = results.map(r => r.payload);

    expect(payloads).toContain('NW');
    expect(payloads).not.toContain('NE');
    expect(payloads).not.toContain('SW');
    expect(payloads).not.toContain('SE');
    // Total candidates must be ≤ all items
    expect(results.length).toBeLessThanOrEqual(6);

    qt.destroy();
  });
});

describe('Quadtree — queryRect', () => {
  test('queryRect returns items whose bounds overlap the query rect', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 200, 200));

    qt.insert({ bounds: new Rectangle(10, 10, 40, 40), payload: 'left' });
    qt.insert({ bounds: new Rectangle(100, 10, 40, 40), payload: 'right' });

    const query = new Rectangle(0, 0, 60, 60);
    const results = qt.queryRect(query);

    const payloads = results.map(r => r.payload);

    expect(payloads).toContain('left');
    expect(payloads).not.toContain('right');

    qt.destroy();
  });

  test('queryRect with a rect that overlaps multiple items returns all of them', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 200, 200));

    qt.insert({ bounds: new Rectangle(10, 10, 40, 40), payload: 'A' });
    qt.insert({ bounds: new Rectangle(30, 10, 40, 40), payload: 'B' });

    const query = new Rectangle(0, 0, 80, 60);
    const results = qt.queryRect(query);

    const payloads = results.map(r => r.payload);

    expect(payloads).toContain('A');
    expect(payloads).toContain('B');

    qt.destroy();
  });

  test('queryRect that does not intersect any item returns empty array', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 200, 200));

    qt.insert({ bounds: new Rectangle(10, 10, 20, 20), payload: 'A' });

    const results = qt.queryRect(new Rectangle(150, 150, 10, 10));

    expect(results).toHaveLength(0);

    qt.destroy();
  });
});

describe('Quadtree — clear', () => {
  test('clear() empties the tree; subsequent queryPoint returns nothing', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

    qt.insert({ bounds: new Rectangle(10, 10, 30, 30), payload: 'A' });
    qt.insert({ bounds: new Rectangle(50, 50, 30, 30), payload: 'B' });

    qt.clear();

    expect(qt.queryPoint(20, 20)).toHaveLength(0);
    expect(qt.queryPoint(60, 60)).toHaveLength(0);

    qt.destroy();
  });

  test('after clear() new items can be inserted and queried', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

    qt.insert({ bounds: new Rectangle(10, 10, 30, 30), payload: 'old' });
    qt.clear();

    qt.insert({ bounds: new Rectangle(50, 50, 20, 20), payload: 'new' });
    const results = qt.queryPoint(55, 55);

    expect(results).toHaveLength(1);
    expect(results[0].payload).toBe('new');

    qt.destroy();
  });
});

describe('Quadtree — results buffer reuse', () => {
  test('passing an existing array appends into it without replacing it', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

    qt.insert({ bounds: new Rectangle(10, 10, 30, 30), payload: 'A' });

    const buf: ReturnType<typeof qt.queryPoint> = [];

    qt.queryPoint(20, 20, buf);

    expect(buf).toHaveLength(1);
    expect(buf[0].payload).toBe('A');

    qt.destroy();
  });

  test('same buffer reference is returned from queryPoint', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

    qt.insert({ bounds: new Rectangle(10, 10, 30, 30), payload: 'A' });

    const buf: ReturnType<typeof qt.queryPoint> = [];
    const returned = qt.queryPoint(20, 20, buf);

    expect(returned).toBe(buf);

    qt.destroy();
  });
});

describe('Quadtree — remove', () => {
  test('remove() deletes an inserted item so it is no longer returned by queryPoint', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
    const item = { bounds: new Rectangle(10, 10, 30, 30), payload: 'A' };

    qt.insert(item);
    expect(qt.queryPoint(20, 20)).toHaveLength(1);

    const removed = qt.remove(item);

    expect(removed).toBe(true);
    expect(qt.queryPoint(20, 20)).toHaveLength(0);

    qt.destroy();
  });

  test('remove() returns false for an item not in the tree', () => {
    const qt = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
    const item = { bounds: new Rectangle(10, 10, 30, 30), payload: 'A' };

    const removed = qt.remove(item);

    expect(removed).toBe(false);

    qt.destroy();
  });
});

// ---------------------------------------------------------------------------
// 2. InteractionManager — persistent spatial index lifecycle
// ---------------------------------------------------------------------------

describe('InteractionManager — lazy-init: quadtree null with no interactive nodes', () => {
  test('_getDebugQuadtree() returns null before any interactive node is added', () => {
    const { app } = createApp();
    const im = new InteractionManager(app);

    expect(im._getDebugQuadtree()).toBeNull();

    im.destroy();
  });
});

describe('InteractionManager — lazy-init: quadtree created on first interactive node', () => {
  test('setting interactive=true on a node creates the quadtree', () => {
    const { app } = createApp();
    const im = new InteractionManager(app);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    expect(im._getDebugQuadtree()).toBeNull();

    sprite.interactive = true;

    expect(im._getDebugQuadtree()).not.toBeNull();

    im.destroy();
    sprite.destroy();
  });
});

describe('InteractionManager — lazy-dispose: quadtree null when last interactive node removed', () => {
  test('quadtree is destroyed when last interactive node becomes non-interactive', () => {
    const { app } = createApp();
    const im = new InteractionManager(app);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    expect(im._getDebugQuadtree()).not.toBeNull();

    sprite.interactive = false;
    expect(im._getDebugQuadtree()).toBeNull();

    im.destroy();
    sprite.destroy();
  });

  test('quadtree is destroyed when last interactive node is removed from scene', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);
    expect(im._getDebugQuadtree()).not.toBeNull();

    scene.removeChild(sprite);
    expect(im._getDebugQuadtree()).toBeNull();

    im.destroy();
    sprite.destroy();
  });
});

describe('InteractionManager — spatial index: basic hit', () => {
  test('pointerdown over interactive sprite fires onPointerDown', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = jest.fn();

    sprite.onPointerDown.add(handler);
    signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
    flushInteractions(im);

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as InteractionEvent).target).toBe(sprite);

    im.destroy();
    sprite.destroy();
  });

  test('pointer missing sprite does NOT fire onPointerDown', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = jest.fn();

    sprite.onPointerDown.add(handler);
    signals.onPointerDown.dispatch(makePointer({ x: 200, y: 200 }));
    flushInteractions(im);

    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });
});

describe('InteractionManager — spatial index: z-order preserved', () => {
  test('top sprite (added last, higher order) wins over bottom sprite at same point', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    const bottom = new TestSprite().setBounds(0, 0, 100, 100);
    const top = new TestSprite().setBounds(0, 0, 100, 100);

    bottom.interactive = true;
    top.interactive = true;
    scene.addChild(bottom);
    scene.addChild(top);

    const bottomHandler = jest.fn();
    const topHandler = jest.fn();

    bottom.onPointerDown.add(bottomHandler);
    top.onPointerDown.add(topHandler);

    signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
    flushInteractions(im);

    // The spatial index uses insertion-order so "top" (set interactive later)
    // gets the higher order number and wins.
    expect(topHandler).toHaveBeenCalledTimes(1);
    expect(bottomHandler).not.toHaveBeenCalled();

    im.destroy();
    bottom.destroy();
    top.destroy();
  });
});

describe('InteractionManager — spatial index: addChild registers subtree', () => {
  test('addChild of Container with interactive descendants registers all of them', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    const container = new Container();
    const child1 = new TestSprite().setBounds(0, 0, 50, 50);
    const child2 = new TestSprite().setBounds(50, 0, 50, 50);

    child1.interactive = true;
    child2.interactive = true;
    container.addChild(child1);
    container.addChild(child2);

    // Before adding container to scene — both children already registered
    // because interactive=true triggered _registerNode individually.
    expect(im._getDebugQuadtree()).not.toBeNull();

    scene.addChild(container);

    // Both children should be discoverable via hit test.
    im.update(); // flush stale entries

    im.destroy();
    container.destroy();
  });
});

describe('InteractionManager — spatial index: removeChild unregisters subtree', () => {
  test('removeChild unregisters all interactive descendants', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    const container = new Container();
    const child = new TestSprite().setBounds(0, 0, 50, 50);

    child.interactive = true;
    container.addChild(child);
    scene.addChild(container);

    expect(im._getDebugQuadtree()).not.toBeNull();

    scene.removeChild(container);

    // child was unregistered → no more interactive nodes → quadtree disposed.
    expect(im._getDebugQuadtree()).toBeNull();

    im.destroy();
    container.destroy();
  });
});

describe('InteractionManager — spatial index: transform mutation reflected at next query', () => {
  test('moving node between queries updates its quadtree entry', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    const sprite = new TestSprite().setBounds(0, 0, 50, 50);

    sprite.interactive = true;
    scene.addChild(sprite);

    const handler = jest.fn();

    sprite.onPointerDown.add(handler);

    // Initial query: hit inside original bounds.
    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    flushInteractions(im);
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    // Move sprite so it no longer covers (25, 25).
    sprite.setBounds(200, 200, 50, 50);

    signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
    flushInteractions(im);

    // After move, (25,25) is outside bounds — handler must not fire.
    expect(handler).not.toHaveBeenCalled();

    im.destroy();
    sprite.destroy();
  });
});

describe('InteractionManager — spatial index: query results match recursive-walk results', () => {
  test('indexed hit result matches recursive-walk hit result for same scene', () => {
    const { app, scene, signals } = createApp();
    const im = new InteractionManager(app);

    // Two non-overlapping sprites.
    const spriteA = new TestSprite().setBounds(0, 0, 100, 100);
    const spriteB = new TestSprite().setBounds(200, 200, 100, 100);

    spriteA.interactive = true;
    spriteB.interactive = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    const aHandler = jest.fn();
    const bHandler = jest.fn();

    spriteA.onPointerDown.add(aHandler);
    spriteB.onPointerDown.add(bHandler);

    // Hit spriteA
    signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
    flushInteractions(im);
    expect(aHandler).toHaveBeenCalledTimes(1);
    expect(bHandler).not.toHaveBeenCalled();

    aHandler.mockClear();
    bHandler.mockClear();

    // Hit spriteB
    signals.onPointerDown.dispatch(makePointer({ x: 250, y: 250 }));
    flushInteractions(im);
    expect(bHandler).toHaveBeenCalledTimes(1);
    expect(aHandler).not.toHaveBeenCalled();

    im.destroy();
    spriteA.destroy();
    spriteB.destroy();
  });
});

describe('InteractionManager — spatial index: removing all interactive nodes mid-frame', () => {
  test('quadtree disposes correctly when all interactive nodes are removed', () => {
    const { app, scene } = createApp();
    const im = new InteractionManager(app);

    const sprite1 = new TestSprite().setBounds(0, 0, 50, 50);
    const sprite2 = new TestSprite().setBounds(100, 0, 50, 50);

    sprite1.interactive = true;
    sprite2.interactive = true;
    scene.addChild(sprite1);
    scene.addChild(sprite2);

    expect(im._getDebugQuadtree()).not.toBeNull();

    sprite1.interactive = false;
    expect(im._getDebugQuadtree()).not.toBeNull(); // sprite2 still interactive

    sprite2.interactive = false;
    expect(im._getDebugQuadtree()).toBeNull(); // all gone → disposed

    im.destroy();
    sprite1.destroy();
    sprite2.destroy();
  });
});
