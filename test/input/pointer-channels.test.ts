/**
 * Tests for unified Pointer channel-buffer integration:
 * slot allocation, normalization, multi-touch, gestures, and long-press.
 */

import { InputManager } from '@/input/InputManager';
import { Pointer } from '@/input/Pointer';

import type { Application } from '@/core/Application';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    // getBoundingClientRect must match logical pixel position for normalisation.
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect);

    return canvas;
};

const createInputManager = (canvas?: HTMLCanvasElement): InputManager => {
    const c = canvas ?? createCanvas();
    const app = {
        canvas: c,
        options: {
            gamepadDefinitions: [],
            pointerDistanceThreshold: 10,
        },
    } as unknown as Application;

    return new InputManager(app);
};

/** Fire a pointer event on the canvas and return it. */
const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): PointerEvent => {
    const evt = new PointerEvent(type, { bubbles: true, ...init });

    canvas.dispatchEvent(evt);

    return evt;
};

/** Sequence: pointerover → (optional) pointerdown */
const pointerOver = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
    fire(canvas, 'pointerover', init);
};

const pointerDown = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
    fire(canvas, 'pointerdown', init);
};

const pointerMove = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
    fire(canvas, 'pointermove', init);
};

const pointerUp = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
    fire(canvas, 'pointerup', init);
};

const pointerLeave = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
    fire(canvas, 'pointerleave', init);
};

const pointerCancel = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
    fire(canvas, 'pointercancel', init);
};

// Channel accessors directly via Pointer namespace consts.
const ch = (im: InputManager, channel: number): number => (im as unknown as { channels: Float32Array }).channels[channel];

// ---------------------------------------------------------------------------
// 1. Single mouse pointer-down sets Active=1, IsMouse=1, IsTouch=0
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — mouse', () => {
    test('single mouse pointer-down writes Active=1, IsMouse=1, IsTouch=0', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);

        pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 200, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 200, buttons: 1, isPrimary: true });

        expect(ch(im, Pointer.Active)).toBe(1);
        expect(ch(im, Pointer.IsMouse)).toBe(1);
        expect(ch(im, Pointer.IsTouch)).toBe(0);

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 2. Single touch pointer-down sets Active=1, IsTouch=1, IsMouse=0
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — touch', () => {
    test('single touch pointer-down writes Active=1, IsTouch=1, IsMouse=0', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);

        pointerOver(canvas, { pointerId: 10, pointerType: 'touch', clientX: 50, clientY: 80, isPrimary: true });
        pointerDown(canvas, { pointerId: 10, pointerType: 'touch', clientX: 50, clientY: 80, isPrimary: true });

        expect(ch(im, Pointer.Active)).toBe(1);
        expect(ch(im, Pointer.IsTouch)).toBe(1);
        expect(ch(im, Pointer.IsMouse)).toBe(0);

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 3. Two simultaneous touch pointers occupy slots 0 and 1
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — multi-touch', () => {
    test('two simultaneous touch pointers occupy slot 0 and slot 1', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);

        // First touch.
        pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });

        // Second touch.
        pointerOver(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200, isPrimary: false });
        pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200, isPrimary: false });

        expect(ch(im, Pointer.Slot0Active)).toBe(1);
        expect(ch(im, Pointer.Slot1Active)).toBe(1);

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 4. Releasing slot 0 frees it; next pointer lands in slot 0 again
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — slot reuse', () => {
    test('after slot 0 is released, the next new pointer lands in slot 0', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);

        // Pointer 1 takes slot 0.
        pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
        expect(ch(im, Pointer.Slot0Active)).toBe(1);

        // Pointer 1 leaves → slot 0 freed.
        pointerLeave(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
        expect(ch(im, Pointer.Slot0Active)).toBe(0);

        // Pointer 2 should land in slot 0 again (front of free-list).
        pointerOver(canvas, { pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 20, isPrimary: true });
        pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 20, isPrimary: true });
        expect(ch(im, Pointer.Slot0Active)).toBe(1);

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 5. 17th simultaneous pointer is silently dropped
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — 16 pointer maximum', () => {
    test('the 17th simultaneous pointer is silently dropped', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);

        // Allocate all 16 slots.
        for (let i = 1; i <= 16; i++) {
            pointerOver(canvas, { pointerId: i, pointerType: 'touch', clientX: i * 10, clientY: 10, isPrimary: i === 1 });
        }

        // Verify all 16 slots are active.
        for (let s = 0; s < 16; s++) {
            expect(ch(im, Pointer.Slot0Active + s * 16)).toBe(1);
        }

        // 17th pointer — should be silently ignored (no crash, no slot written).
        expect(() => {
            pointerOver(canvas, { pointerId: 17, pointerType: 'touch', clientX: 170, clientY: 10, isPrimary: false });
        }).not.toThrow();

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 6. pointermove updates channels[Pointer.X] and channels[Pointer.Y]
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — move normalization', () => {
    test('pointermove writes normalized x/y to channels', () => {
        const canvas = createCanvas(800, 600); // 0..1 maps to 0..800 / 0..600
        const im = createInputManager(canvas);

        pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, isPrimary: true });
        pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 400, clientY: 300, isPrimary: true });

        expect(ch(im, Pointer.X)).toBeCloseTo(0.5, 5);
        expect(ch(im, Pointer.Y)).toBeCloseTo(0.5, 5);

        im.destroy();
    });

    test('off-canvas coordinates are clamped to [0, 1]', () => {
        const canvas = createCanvas(800, 600);
        const im = createInputManager(canvas);

        pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, isPrimary: true });
        pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: -100, clientY: 900, isPrimary: true });

        expect(ch(im, Pointer.X)).toBe(0);
        expect(ch(im, Pointer.Y)).toBe(1);

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 7. Pressure, width/height, twist, tilt are written
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — extended properties', () => {
    test('pressure, width, height, twist, tiltX, tiltY are normalized and written', () => {
        const canvas = createCanvas(800, 600);
        const im = createInputManager(canvas);

        pointerOver(canvas, {
            pointerId: 1,
            pointerType: 'pen',
            clientX: 400,
            clientY: 300,
            pressure: 0.75,
            width: 80,          // 80 / 800 = 0.1
            height: 60,         // 60 / 600 = 0.1
            twist: 180,         // 180 / 359 ≈ 0.5014
            tiltX: 45,          // (45 + 90) / 180 = 0.75
            tiltY: -45,         // (-45 + 90) / 180 = 0.25
            isPrimary: true,
        });

        expect(ch(im, Pointer.Pressure)).toBeCloseTo(0.75, 5);
        expect(ch(im, Pointer.Width)).toBeCloseTo(80 / 800, 5);
        expect(ch(im, Pointer.Height)).toBeCloseTo(60 / 600, 5);
        expect(ch(im, Pointer.Twist)).toBeCloseTo(180 / 359, 5);
        expect(ch(im, Pointer.TiltX)).toBeCloseTo((45 + 90) / 180, 5);
        expect(ch(im, Pointer.TiltY)).toBeCloseTo((-45 + 90) / 180, 5);
        expect(ch(im, Pointer.IsPen)).toBe(1);

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 8. Pinch: two touch pointers move apart → onPinch fires with scale > 1
// ---------------------------------------------------------------------------

describe('Gesture — pinch', () => {
    test('two touch pointers spreading apart fire onPinch with scale > 1', () => {
        const canvas = createCanvas(800, 600);
        const im = createInputManager(canvas);

        const pinchSpy = jest.fn();

        im.onPinch.add(pinchSpy);

        // Two touches start close together.
        pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300, isPrimary: true });

        pointerOver(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300, isPrimary: false });
        pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300, isPrimary: false });

        // First move establishes the distance baseline.
        pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300, isPrimary: true });

        // Second move increases the distance → pinch fires.
        pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 300, isPrimary: true });

        expect(pinchSpy).toHaveBeenCalledTimes(1);
        const [scale] = pinchSpy.mock.calls[0] as [number, unknown];

        expect(scale).toBeGreaterThan(1); // fingers spreading → scale > 1

        im.destroy();
    });

    test('two mouse pointers do not fire onPinch (mice cannot pinch)', () => {
        const canvas = createCanvas(800, 600);
        const im = createInputManager(canvas);

        const pinchSpy = jest.fn();

        im.onPinch.add(pinchSpy);

        pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 300, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 300, isPrimary: true });

        pointerOver(canvas, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 300, isPrimary: false });
        pointerDown(canvas, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 300, isPrimary: false });

        pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 300, isPrimary: true });

        expect(pinchSpy).not.toHaveBeenCalled();

        im.destroy();
    });
});

// ---------------------------------------------------------------------------
// 9. Long-press: pointer held ≥ 500ms fires onLongPress
// ---------------------------------------------------------------------------

describe('Gesture — long press', () => {
    beforeAll(() => {
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test('pointer held 600ms without moving fires onLongPress', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);

        const longPressSpy = jest.fn();

        im.onLongPress.add(longPressSpy);

        pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });

        expect(longPressSpy).not.toHaveBeenCalled();

        jest.advanceTimersByTime(600);

        expect(longPressSpy).toHaveBeenCalledTimes(1);

        im.destroy();
    });

    test('pointer that moves beyond threshold cancels long-press', () => {
        const canvas = createCanvas();
        const im = createInputManager(canvas);
        const longPressSpy = jest.fn();

        im.onLongPress.add(longPressSpy);

        pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });
        pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });

        // Move well beyond the 10px threshold.
        pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 100, isPrimary: true });

        jest.advanceTimersByTime(600);

        expect(longPressSpy).not.toHaveBeenCalled();

        im.destroy();
    });
});
