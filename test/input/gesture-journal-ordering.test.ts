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
 * that produced it, and firing before the frame boundary a long-press hold
 * completed mid-frame instead of waiting for the next `update()`. Queuing both
 * onto the same journal `GestureRecognizer` reports into fixes both: a
 * gesture now dispatches in the exact slot it arrived in (right after the
 * pointer-move phase that produced it), and only on the next `update()`.
 *
 * The long-press hold is measured in engine time, so it is driven here by
 * feeding frame deltas to `preUpdate()` — never by a fake wall clock. That is
 * also what makes it stop with `app.scenes.pause()`, which the mock app below
 * models with a writable `paused` flag.
 */

import type { Application } from '#core/Application';
import { Time } from '#core/Time';
import { InputManager } from '#input/InputManager';
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

/** Stand-in for `app.scenes`, holding the one flag `InputManager` reads off it. */
interface MockScenes {
  paused: boolean;
}

const createMockApp = (canvas: HTMLCanvasElement, scenes: MockScenes): Application =>
  ({
    canvas,
    platform: new BrowserPlatform(canvas),
    width: canvas.width,
    height: canvas.height,
    pixelRatio: 1,
    scenes,
    options: {
      input: {
        gamepadDefinitions: [],
        pointerDistanceThreshold: 10,
      },
    },
    _backingStoreToDesign: (backingStoreX: number, backingStoreY: number): { x: number; y: number } => ({ x: backingStoreX, y: backingStoreY }),
  }) as unknown as Application;

const createInputManager = (canvas?: HTMLCanvasElement): { im: InputManager; canvas: HTMLCanvasElement; scenes: MockScenes } => {
  const c = canvas ?? createCanvas();
  const scenes: MockScenes = { paused: false };

  return { im: new InputManager(createMockApp(c, scenes)), canvas: c, scenes };
};

/** One frame boundary with no engine time elapsed — drains the journal without advancing any hold. */
const drainFrame = (im: InputManager): void => {
  im.preUpdate(Time.zero);
};

/**
 * Run `milliseconds` of engine time through the manager in 16 ms frames, the
 * way the application's frame loop would. Long-press is measured in exactly
 * this time, so this is the only clock that can mature one.
 */
const advanceFrames = (im: InputManager, milliseconds: number): void => {
  const frame = new Time(16);
  let remaining = milliseconds;

  while (remaining > 0) {
    frame.milliseconds = Math.min(16, remaining);
    im.preUpdate(frame);
    remaining -= frame.milliseconds;
  }
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
  drainFrame(im);
};

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
    drainFrame(im);

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
    drainFrame(im);

    expect(calls).toEqual(['move', 'rotate']);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Long-press: queued, dispatches only on the next frame boundary
// ---------------------------------------------------------------------------

describe('InputManager — long-press queuing', () => {
  test('a hold that completes dispatches on the frame it completes on, exactly once', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    // One frame short of the threshold: the hold is queued but not due.
    advanceFrames(im, 496);
    expect(spy).not.toHaveBeenCalled();

    // The frame that crosses 500 ms both matures the hold and drains it.
    advanceFrames(im, 16);
    expect(spy).toHaveBeenCalledTimes(1);

    // Holding on does not repeat it — the entry is consumed.
    advanceFrames(im, 500);
    expect(spy).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('onPointerUp before the hold completes prevents the long-press from ever being queued or dispatched', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    drainFrame(im);

    advanceFrames(im, 600);
    drainFrame(im);

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });

  test('onPointerCancel before the hold completes prevents the long-press', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    drainFrame(im);

    advanceFrames(im, 600);
    drainFrame(im);

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });

  test('onPointerLeave before the hold completes prevents the long-press', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    drainFrame(im);
    im._finishInteractionFrame();

    advanceFrames(im, 600);
    drainFrame(im);

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Long-press runs on engine time, and a paused scene stops that time
// ---------------------------------------------------------------------------

describe('InputManager — long-press and the scene pause', () => {
  test('a finger held through a paused scene never completes its long-press, however long the pause lasts', () => {
    const { im, canvas, scenes } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    scenes.paused = true;
    advanceFrames(im, 5000);

    expect(spy).not.toHaveBeenCalled();

    im.destroy();
  });

  test('the hold resumes from where the pause froze it, rather than restarting or catching up', () => {
    const { im, canvas, scenes } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    advanceFrames(im, 400);

    scenes.paused = true;
    advanceFrames(im, 5000);
    expect(spy).not.toHaveBeenCalled();

    scenes.paused = false;

    // The 400 ms banked before the pause still count, so 96 ms is one frame
    // short and 112 ms crosses the threshold — the pause neither reset the
    // hold nor credited it the frozen frames.
    advanceFrames(im, 96);
    expect(spy).not.toHaveBeenCalled();

    advanceFrames(im, 16);
    expect(spy).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('an unpaused scene fires the long-press after the equivalent amount of engine time', () => {
    const { im, canvas } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    advanceFrames(im, 5000);

    expect(spy).toHaveBeenCalledTimes(1);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// destroy(): pending holds and queued state are cleared safely
// ---------------------------------------------------------------------------

describe('InputManager — destroy clears gesture holds and queued state', () => {
  test('destroy() before a pending long-press completes leaves it permanently unfired', () => {
    const { im, canvas, scenes } = createInputManager();
    const spy = vi.fn();

    im.onLongPress.add(spy);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });

    im.destroy();

    // A destroyed manager is not driven any more; even if something still
    // ticked it, the pending hold is gone.
    expect(scenes.paused).toBe(false);
    expect(() => advanceFrames(im, 600)).not.toThrow();
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
// Center coordinates must not leak between entries
// ---------------------------------------------------------------------------

describe('InputManager — gesture center coordinates across multiple queued gestures in one frame', () => {
  test('two pinch occurrences queued in the same frame each dispatch with their own, distinct center', () => {
    const { im, canvas } = createInputManager();
    const seenCenters: Array<{ x: number; y: number }> = [];

    im.onPinch.add((_scale, centerX, centerY) => {
      seenCenters.push({ x: centerX, y: centerY });
    });

    settleTwoTouchBaseline(im, canvas, 10, 0); // distance=10, center=(5,0)

    // Two distinct pinches queued within the SAME frame, before update():
    // center (20,0) then center (50,0).
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 40, clientY: 0, isPrimary: false }); // distance=40, center=(20,0)
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 0, isPrimary: false }); // distance=100, center=(50,0)
    drainFrame(im);

    expect(seenCenters).toEqual([
      { x: 20, y: 0 },
      { x: 50, y: 0 },
    ]);

    im.destroy();
  });
});
