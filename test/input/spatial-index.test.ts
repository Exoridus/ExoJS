import { Rectangle } from '@/math/Rectangle';
import { Quadtree } from '@/math/Quadtree';
import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { InteractionManager } from '@/input/InteractionManager';
import { Scene } from '@/core/Scene';
import type { InteractionEvent } from '@/input/InteractionEvent';
import type { Application } from '@/core/Application';
import type { InputManager } from '@/input/InputManager';
import type { Pointer } from '@/input/Pointer';
import type { Signal } from '@/core/Signal';

// ---------------------------------------------------------------------------
// TestSprite — same helper as interaction.test.ts but also overrides getBounds
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
        return (
            x >= this._left
            && x < this._left + this._width
            && y >= this._top
            && y < this._top + this._height
        );
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

const makePointer = ({ id = 1, x = 0, y = 0 }: MockPointerOptions = {}): Pointer => ({
    id,
    x,
    y,
    type: 'mouse',
    isPrimary: true,
} as unknown as Pointer);

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
        inputManager: signals as unknown as InputManager,
        sceneManager: {
            get scene(): Scene | null {
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
        const payloads = results.map((r) => r.payload);

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

        const payloads = results.map((r) => r.payload);

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

        const payloads = results.map((r) => r.payload);

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
});

// ---------------------------------------------------------------------------
// 2. InteractionManager with useSpatialIndex = true
// ---------------------------------------------------------------------------

describe('InteractionManager — spatial index: basic hit', () => {
    test('pointerdown over interactive sprite fires onPointerDown (spatial index)', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);

        im.useSpatialIndex = true;

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

    test('pointer missing sprite does NOT fire onPointerDown (spatial index)', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);

        im.useSpatialIndex = true;

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
    test('top sprite (added last) wins over bottom sprite at same point', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);

        im.useSpatialIndex = true;

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

        // The spatial index uses depth-first insertion order so "top" (added
        // last, visited last) gets the higher order number and wins.
        expect(topHandler).toHaveBeenCalledTimes(1);
        expect(bottomHandler).not.toHaveBeenCalled();

        im.destroy();
        bottom.destroy();
        top.destroy();
    });
});

describe('InteractionManager — spatial index: toggle mid-test', () => {
    test('toggling useSpatialIndex false→true between dispatches produces same hit result', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);

        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);

        // First dispatch with spatial index OFF (default)
        im.useSpatialIndex = false;
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        expect(handler).toHaveBeenCalledTimes(1);

        // Second dispatch with spatial index ON
        im.useSpatialIndex = true;
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        expect(handler).toHaveBeenCalledTimes(2);

        im.destroy();
        sprite.destroy();
    });
});
