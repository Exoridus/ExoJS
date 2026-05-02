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

    test('does NOT fire onPointerDown when interactive=false', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = false;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

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
        flushInteractions(im);

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
        flushInteractions(im);

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
        flushInteractions(im);
        order.length = 0; // reset after setup

        // Now move to B
        signals.onPointerMove.dispatch(makePointer({ x: 80, y: 25 }));
        flushInteractions(im);

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
        flushInteractions(im);
        // Pointer 2 over B
        signals.onPointerDown.dispatch(makePointer({ id: 2, x: 80, y: 25 }));
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
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.cursor = 'pointer';
        scene.addChild(sprite);

        signals.onPointerMove.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

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
        flushInteractions(im);
        expect(canvas.style.cursor).toBe('pointer');

        signals.onPointerLeave.dispatch(makePointer({ id: 1, x: 50, y: 50 }));
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
    test('onPointerTap signal fires on hit node when inputManager.onPointerTap dispatches', () => {
        const { app, scene, signals } = createApp();
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerTap.add(handler);
        signals.onPointerTap.dispatch(makePointer({ x: 50, y: 50 }));
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
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        scene.addChild(sprite);

        const handler = jest.fn();

        sprite.onPointerDown.add(handler);
        im.destroy();

        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
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
            Object.defineProperty(canvas, 'setPointerCapture', { value: () => { /* no-op */ }, writable: true, configurable: true });
        }

        if (!('releasePointerCapture' in canvas)) {
            Object.defineProperty(canvas, 'releasePointerCapture', { value: () => { /* no-op */ }, writable: true, configurable: true });
        }

        jest.spyOn(canvas, 'setPointerCapture').mockImplementation(() => { /* no-op */ });
        jest.spyOn(canvas, 'releasePointerCapture').mockImplementation(() => { /* no-op */ });
    };

    test('dragstart fires on pointerdown; pointermove updates position; dragend fires on pointerup', () => {
        const { app, scene, signals, canvas } = createApp();
        mockPointerCapture(canvas);
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.draggable = true;
        scene.addChild(sprite);

        const dragStartHandler = jest.fn();
        const dragHandler = jest.fn();
        const dragEndHandler = jest.fn();

        sprite.onDragStart.add(dragStartHandler);
        sprite.onDrag.add(dragHandler);
        sprite.onDragEnd.add(dragEndHandler);

        // Pointer down starts drag
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);
        expect(dragStartHandler).toHaveBeenCalledTimes(1);

        // Pointer move drags
        signals.onPointerMove.dispatch(makePointer({ x: 70, y: 60 }));
        flushInteractions(im);
        expect(dragHandler).toHaveBeenCalledTimes(1);

        // Pointer up ends drag
        signals.onPointerUp.dispatch(makePointer({ x: 70, y: 60 }));
        flushInteractions(im);
        expect(dragEndHandler).toHaveBeenCalledTimes(1);

        // Further move should NOT fire drag events
        signals.onPointerMove.dispatch(makePointer({ x: 90, y: 90 }));
        flushInteractions(im);
        expect(dragHandler).toHaveBeenCalledTimes(1);

        im.destroy();
        sprite.destroy();
    });

    test('drag offset is preserved — node stays at grab-point relative distance', () => {
        const { app, scene, signals, canvas } = createApp();
        mockPointerCapture(canvas);
        const im = new InteractionManager(app);

        // Sprite positioned at (50, 50) in scene space.
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.draggable = true;
        sprite.position.x = 50;
        sprite.position.y = 50;
        scene.addChild(sprite);

        // Grab at (60, 60) — offset is (50-60, 50-60) = (-10, -10)
        signals.onPointerDown.dispatch(makePointer({ x: 60, y: 60 }));
        flushInteractions(im);

        // Move pointer to (100, 80) — expected node position: (100-10, 80-10) = (90, 70)
        signals.onPointerMove.dispatch(makePointer({ x: 100, y: 80 }));
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
        const dragged = new TestSprite().setBounds(0, 0, 100, 100);
        const other = new TestSprite().setBounds(200, 0, 100, 100);

        dragged.interactive = true;
        dragged.draggable = true;
        other.interactive = true;
        scene.addChild(dragged);
        scene.addChild(other);

        const otherOverHandler = jest.fn();

        other.onPointerOver.add(otherOverHandler);

        // Start drag on dragged sprite
        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        // Move pointer into other sprite's bounds — should NOT fire pointerover on other
        signals.onPointerMove.dispatch(makePointer({ x: 250, y: 50 }));
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
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.draggable = false;
        scene.addChild(sprite);

        const dragStartHandler = jest.fn();

        sprite.onDragStart.add(dragStartHandler);

        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        expect(dragStartHandler).not.toHaveBeenCalled();

        im.destroy();
        sprite.destroy();
    });

    test('drag does NOT start if interactive=false (no pointerdown lands)', () => {
        const { app, scene, signals, canvas } = createApp();
        mockPointerCapture(canvas);
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = false;
        sprite.draggable = true;
        scene.addChild(sprite);

        const dragStartHandler = jest.fn();
        const downHandler = jest.fn();

        sprite.onDragStart.add(dragStartHandler);
        sprite.onPointerDown.add(downHandler);

        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
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
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.draggable = true;
        scene.addChild(sprite);

        const dragEndHandler = jest.fn();
        const dragHandler = jest.fn();

        sprite.onDragEnd.add(dragEndHandler);
        sprite.onDrag.add(dragHandler);

        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        signals.onPointerCancel.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        expect(dragEndHandler).toHaveBeenCalledTimes(1);

        // Further move after cancel should NOT fire drag
        signals.onPointerMove.dispatch(makePointer({ x: 60, y: 60 }));
        flushInteractions(im);
        expect(dragHandler).not.toHaveBeenCalled();

        im.destroy();
        sprite.destroy();
    });

    test('onDrag fires on every pointermove during drag with dragged node as currentTarget', () => {
        const { app, scene, signals, canvas } = createApp();
        mockPointerCapture(canvas);
        const im = new InteractionManager(app);
        const sprite = new TestSprite().setBounds(0, 0, 100, 100);

        sprite.interactive = true;
        sprite.draggable = true;
        scene.addChild(sprite);

        const dragTargets: unknown[] = [];

        sprite.onDrag.add((e) => { dragTargets.push(e.currentTarget); });

        signals.onPointerDown.dispatch(makePointer({ x: 50, y: 50 }));
        flushInteractions(im);

        signals.onPointerMove.dispatch(makePointer({ x: 55, y: 55 }));
        flushInteractions(im);

        signals.onPointerMove.dispatch(makePointer({ x: 60, y: 60 }));
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
        const parent = new Container();
        const child = new TestSprite().setBounds(0, 0, 50, 50);

        parent.interactive = true;
        child.interactive = true;
        child.draggable = true;
        scene.root.addChild(parent);
        parent.addChild(child);

        const parentDragStart = jest.fn();
        const parentDrag = jest.fn();
        const parentDragEnd = jest.fn();

        parent.onDragStart.add(parentDragStart);
        parent.onDrag.add(parentDrag);
        parent.onDragEnd.add(parentDragEnd);

        signals.onPointerDown.dispatch(makePointer({ x: 25, y: 25 }));
        flushInteractions(im);

        signals.onPointerMove.dispatch(makePointer({ x: 30, y: 30 }));
        flushInteractions(im);

        signals.onPointerUp.dispatch(makePointer({ x: 30, y: 30 }));
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
        const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
        const spriteB = new TestSprite().setBounds(60, 0, 50, 50);

        spriteA.interactive = true;
        spriteA.draggable = true;
        spriteB.interactive = true;
        spriteB.draggable = true;
        scene.addChild(spriteA);
        scene.addChild(spriteB);

        const aDrag = jest.fn();
        const bDown = jest.fn();

        spriteA.onDrag.add(aDrag);
        spriteB.onPointerDown.add(bDown);

        // Start drag on A with pointer 1
        signals.onPointerDown.dispatch(makePointer({ id: 1, x: 25, y: 25 }));
        flushInteractions(im);

        // Pointer 2 down on B — should fire normally (separate pointer)
        signals.onPointerDown.dispatch(makePointer({ id: 2, x: 80, y: 25 }));
        flushInteractions(im);

        expect(bDown).toHaveBeenCalledTimes(1);

        // Move pointer 1 — only A's drag fires
        signals.onPointerMove.dispatch(makePointer({ id: 1, x: 30, y: 30 }));
        flushInteractions(im);

        expect(aDrag).toHaveBeenCalledTimes(1);

        im.destroy();
        spriteA.destroy();
        spriteB.destroy();
    });
});
