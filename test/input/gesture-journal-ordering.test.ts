/**
 * Integration tests for gesture occurrences (pinch/rotate/long-press) queued
 * onto InputManager's own global frame journal, driven by real `PointerEvent`
 * dispatches through a real `<canvas>` via `BrowserPlatform`, into a real
 * `InputManager` — not direct `GestureRecognizer` construction (see
 * test/input/gesture-recognizer.test.ts for that).
 *
 * Covers the hardening this file's tests were written against: a gesture
 * derived from a pointer-move used to dispatch synchronously, out of band
 * with the journal — losing its true position relative to the pointer phase
 * that produced it, and firing before the frame boundary a long-press timer
 * elapsed mid-frame instead of waiting for the next `update()`. Queuing both
 * onto the same journal `GestureRecognizer` reports into fixes both: a
 * gesture now dispatches in the exact slot it arrived in (right after the
 * pointer-move phase that produced it), and only on the next `update()`.
 */

import type { Application } from '#core/Application';
import { InputManager } from '#input/InputManager';
import type { Vector } from '#math/Vector';
import { BrowserPlatform } from '#platform/BrowserPlatform';

// ---------------------------------------------------------------------------
// Helpers (mirrors test/input/pointer-channels.test.ts / input-manager-events.test.ts)
// ---------------------------------------------------------------------------

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
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

const createMockApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    platform: new BrowserPlatform(canvas),
    width: canvas.width,
    height: canvas.height,
    pixelRatio: 1,
    options: {
      input: {
        gamepadDefinitions: [],
        pointerDistanceThreshold: 10,
      },
    },
    _backingStoreToDesign: (backingStoreX: number, backingStoreY: number): { x: number; y: number } => ({ x: backingStoreX, y: backingStoreY }),
  }) as unknown as Application;

const createInputManager = (canvas?: HTMLCanvasElement): { im: InputManager; canvas: HTMLCanvasElement } => {
  const c = canvas ?? createCanvas();

  return { im: new InputManager(createMockApp(c)), canvas: c };
};

const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): PointerEvent => {
  const evt = new PointerEvent(type, { bubbles: true, ...init });

  canvas.dispatchEvent(evt);

  return evt;
};

/** Bring up two touch pointers and establish the two-touch distance/angle baseline (no gesture dispatch from this). */
const settleTwoTouchBaseline = (im: InputManager, canvas: HTMLCanvasElement, bx: number, by: number): void => {
  fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0, isPrimary: true });
  fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0, isPrimary: true });
  fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'touch', clientX: bx, clientY: by, isPrimary: false });
  fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: bx, clientY: by, isPrimary: false });
  fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: bx, clientY: by, isPrimary: false });
  im.preUpdate();
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pointer Move precedes the gesture it produced, in the public frame order
// ---------------------------------------------------------------------------

describe('InputManager — gesture journal ordering', () => {
  test('onPointerMove fires before the onPinch it produced, in that exact order within one update()', () => {
    const { im, canvas } = createInputManager();
    const calls: string[] = [];

    im.onPointerMove.add(() => calls.push('move'));
    im.onPinch.add(() => calls.push('pinch'));

    settleTwoTouchBaseline(im, canvas, 10, 0); // distance=10, angle=0
    calls.length = 0; // discard the baseline-establishing move's own dispatch

    // Spread the touches apart — distance changes (angle does not), so only
    // onPinch fires alongside the move, all within this one frame.
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 40, clientY: 0, isPrimary: false });
    im.preUpdate();

    expect(calls).toEqual(['move', 'pinch']);

    im.destroy();
  });

  test('onPointerMove fires before the onRotate it produced, in that exact order within one update()', () => {
    const { im, canvas } = createInputManager();
    const calls: string[] = [];

    im.onPointerMove.add(() => calls.push('move'));
    im.onRotate.add(() => calls.push('rotate'));

    settleTwoTouchBaseline(im, canvas, 40, 0); // distance=40, angle=0
    calls.length = 0; // discard the baseline-establishing move's own dispatch

    // Rotate the pair around the midpoint — distance unchanged, angle changes.
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 0, clientY: 40, isPrimary: false });
    im.preUpdate();

    expect(calls).toEqual(['move', 'rotate']);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Long-press: queued, dispatches only on the next frame boundary
// ---------------------------------------------------------------------------

describe('InputManager — long-press queuing', () => {
  test('a long-press timer elapsing mid-frame does not dispatch until the next update()', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    vi.advanceTimersByTime(500);

    // The timer callback only enqueues onto the journal — it must not have
    // dispatched the signal yet.
    expect(spy).not.toHaveBeenCalled();

    im.preUpdate();

    expect(spy).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('onPointerUp before the timer elapses prevents the long-press from ever being queued or dispatched', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    im.preUpdate();

    vi.advanceTimersByTime(600);
    im.preUpdate();

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });

  test('onPointerCancel before the timer elapses prevents the long-press', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    im.preUpdate();

    vi.advanceTimersByTime(600);
    im.preUpdate();

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });

  test('onPointerLeave before the timer elapses prevents the long-press', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    im.preUpdate();
    im._finishInteractionFrame();

    vi.advanceTimersByTime(600);
    im.preUpdate();

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// destroy(): timers and queued state are cleared safely
// ---------------------------------------------------------------------------

describe('InputManager — destroy clears gesture timers and queued state', () => {
  test('destroy() before a pending long-press timer elapses leaves it permanently unfired', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    im.destroy();

    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  test('destroy() with an already-queued (not yet drained) gesture entry does not dispatch it', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onPinch.add(spy);

    settleTwoTouchBaseline(im, canvas, 10, 0);

    // Queue a pinch entry onto the journal, but never call update() to drain it.
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 40, clientY: 0, isPrimary: false });

    expect(() => im.destroy()).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Shared scratch vector: center coordinates must not leak between entries
// ---------------------------------------------------------------------------

describe('InputManager — gesture center coordinates across multiple queued gestures in one frame', () => {
  test('two pinch occurrences queued in the same frame each dispatch with their own, distinct center — the reused scratch Vector must not leak', () => {
    const { im, canvas } = createInputManager();
    const seenCenters: Array<{ x: number; y: number }> = [];

    im.onPinch.add((_scale, center: Vector) => {
      // Clone synchronously — `center` is a mutable Vector InputManager
      // reuses across every dispatch, so it MUST be read here, not stashed
      // by reference and inspected after the fact.
      seenCenters.push({ x: center.x, y: center.y });
    });

    settleTwoTouchBaseline(im, canvas, 10, 0); // distance=10, center=(5,0)

    // Two distinct pinches queued within the SAME frame, before update():
    // center (20,0) then center (50,0).
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 40, clientY: 0, isPrimary: false }); // distance=40, center=(20,0)
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 0, isPrimary: false }); // distance=100, center=(50,0)
    im.preUpdate();

    expect(seenCenters).toEqual([
      { x: 20, y: 0 },
      { x: 50, y: 0 },
    ]);

    im.destroy();
  });
});
