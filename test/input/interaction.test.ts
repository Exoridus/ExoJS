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
        return (
            x >= this._left
            && x < this._left + this._width
            && y >= this._top
            && y < this._top + this._height
        );
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

/** Build a minimal Application mock wired to a real Scene root. */
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

// ---------------------------------------------------------------------------
// 1. Hit-test basics
// ---------------------------------------------------------------------------

describe('InteractionManager — hit-test basics', () => {
    test('fires onPointerDown on interactive sprite when pointer is over it', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));

        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as InteractionEvent).target).toBe(sprite);

        im.destroy();
        sprite.destroy();
    });

    test('does NOT fire onPointerDown when interactive=false', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = false;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));

        expect(handler).not.toHaveBeenCalled();

        im.destroy();
        sprite.destroy();
    });

    test('does NOT fire when pointer misses the sprite bounds', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);
        signals.onPointerDown.dispatch(makePointer({ x: 200, y: 200 }));

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

        child.onPointerDown.add((e) => {
            childTargets.push(e.target);
            childCurrentTargets.push(e.currentTarget);
        });
        parent.onPointerDown.add((e) => {
            parentTargets.push(e.target);
            parentCurrentTargets.push(e.currentTarget);
        });
        signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));

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
        const parent = new Container();
        const child = new TestSprite().setBounds(0, 0, 50, 50);

        parent.interactive = true;
        child.interactive = true;
        scene.root.addChild(parent);
        parent.addChild(child);

        const parentHandler = jest.fn();

        child.onPointerDown.add((e) => { e.stopPropagation(); });
        parent.onPointerDown.add(parentHandler);
        signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));

        expect(parentHandler).not.toHaveBeenCalled();

        im.destroy();
        parent.destroy();
    });
});

// ---------------------------------------------------------------------------
// 5. Bubble stops at non-interactive parent
// ---------------------------------------------------------------------------

describe('InteractionManager — bubble stops at non-interactive parent', () => {
    test('event does not reach grandparent through non-interactive parent', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const grandparent = new Container();
        const parent = new Container();
        const child = new TestSprite().setBounds(0, 0, 50, 50);

        grandparent.interactive = true;
        parent.interactive = false; // non-interactive — chain breaks here
        child.interactive = true;

        scene.root.addChild(grandparent);
        grandparent.addChild(parent);
        parent.addChild(child);

        const grandparentHandler = jest.fn();
        const childHandler = jest.fn();

        child.onPointerDown.add(childHandler);
        grandparent.onPointerDown.add(grandparentHandler);
        signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));

        expect(childHandler).toHaveBeenCalledTimes(1);
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
        const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
        const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

        spriteA.interactive = true;
        spriteB.interactive = true;
        scene.addChild(spriteA);
        scene.addChild(spriteB);

        const order: string[] = [];

        spriteA.onPointerOut.add(() => { order.push('A:out'); });
        spriteB.onPointerOver.add(() => { order.push('B:over'); });

        // First move over A to establish lastHit
        signals.onPointerMove.dispatch(makePointer({ x: 25, y: 25 }));
        order.length = 0; // reset after setup

        // Now move to B
        signals.onPointerMove.dispatch(makePointer({ x: 80, y: 25 }));

        expect(order).toEqual(['A:out', 'B:over']);

        im.destroy();
        spriteA.destroy();
        spriteB.destroy();
    });
});

// ---------------------------------------------------------------------------
// 7. Multi-pointer independence
// ---------------------------------------------------------------------------

describe('InteractionManager — multi-pointer', () => {
    test('two pointers track separate lastHit independently', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
        const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

        spriteA.interactive = true;
        spriteB.interactive = true;
        scene.addChild(spriteA);
        scene.addChild(spriteB);

        const aDownCount = { count: 0 };
        const bDownCount = { count: 0 };

        spriteA.onPointerDown.add(() => { aDownCount.count++; });
        spriteB.onPointerDown.add(() => { bDownCount.count++; });

        // Pointer 1 over A
        signals.onPointerDown.dispatch(makePointer({ id: 1, x: 25, y: 25 }));
        // Pointer 2 over B
        signals.onPointerDown.dispatch(makePointer({ id: 2, x: 80, y: 25 }));

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
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.cursor = 'pointer';
        scene.addChild(sprite);

        signals.onPointerMove.dispatch(makePointer({ x: 50, y: 50 }));

        expect(canvas.style.cursor).toBe('pointer');

        im.destroy();
        sprite.destroy();
    });

    test('canvas cursor reverts to empty string when pointer leaves', () => {
        const { app, scene, signals, canvas } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.cursor = 'pointer';
        scene.addChild(sprite);

        signals.onPointerMove.dispatch(makePointer({ id: 1, x: 50, y: 50 }));
        expect(canvas.style.cursor).toBe('pointer');

        signals.onPointerLeave.dispatch(makePointer({ id: 1, x: 50, y: 50 }));
        expect(canvas.style.cursor).toBe('');

        im.destroy();
        sprite.destroy();
    });
});

// ---------------------------------------------------------------------------
// 9. Tap
// ---------------------------------------------------------------------------

describe('InteractionManager — tap', () => {
    test('onPointerTap signal fires on hit node when inputManager.onPointerTap dispatches', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerTap.add(handler);
        signals.onPointerTap.dispatch(makePointer({ x: 50, y: 50 }));

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
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);
        im.destroy();

        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));

        expect(handler).not.toHaveBeenCalled();

        sprite.destroy();
    });
});
