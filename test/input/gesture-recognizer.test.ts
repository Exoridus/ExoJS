/**
 * Direct unit tests for GestureRecognizer (long-press timing, two-touch
 * pinch/rotate derivation). Constructed standalone — no InputManager/DOM
 * involved — for precise control over pointer positions and timer advance.
 */

import { Signal } from '#core/Signal';
import { GestureRecognizer } from '#input/GestureRecognizer';
import type { Pointer } from '#input/Pointer';
import type { Vector } from '#math/Vector';

interface FakePointer {
  id: number;
  x: number;
  y: number;
  type: string;
}

const asPointer = (p: FakePointer): Pointer => p as unknown as Pointer;

const distanceThreshold = 10;

interface Harness {
  recognizer: GestureRecognizer;
  onPinch: Signal<[scale: number, center: Vector]>;
  onRotate: Signal<[angleDelta: number, center: Vector]>;
  onLongPress: Signal<[pointer: Pointer]>;
}

const createHarness = (): Harness => {
  const onPinch = new Signal<[scale: number, center: Vector]>();
  const onRotate = new Signal<[angleDelta: number, center: Vector]>();
  const onLongPress = new Signal<[pointer: Pointer]>();
  const recognizer = new GestureRecognizer(distanceThreshold, onPinch, onRotate, onLongPress);

  return { recognizer, onPinch, onRotate, onLongPress };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Long-press
// ---------------------------------------------------------------------------

describe('GestureRecognizer — long press', () => {
  test('fires onLongPress after 500ms for a touch pointer held still', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);

    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'touch' });

    recognizer.onPointerDown(pointer);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(pointer);

    recognizer.destroy();
  });

  test('fires onLongPress for a mouse pointer too (long-press is not touch-only)', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);

    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'mouse' });

    recognizer.onPointerDown(pointer);
    vi.advanceTimersByTime(500);

    expect(spy).toHaveBeenCalledTimes(1);

    recognizer.destroy();
  });

  test('does not fire before 500ms elapses', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);
    recognizer.onPointerDown(asPointer({ id: 1, x: 0, y: 0, type: 'touch' }));
    vi.advanceTimersByTime(499);

    expect(spy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('onPointerUp cancels the pending long-press timer', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);

    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'touch' });

    recognizer.onPointerDown(pointer);
    recognizer.onPointerUp(pointer);
    vi.advanceTimersByTime(600);

    expect(spy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test("onPointerLeave cancels that pointer's pending long-press timer and (for touch) drops two-touch tracking", () => {
    const { recognizer, onLongPress, onPinch } = createHarness();
    const longPressSpy = vi.fn();
    const pinchSpy = vi.fn();

    onLongPress.add(longPressSpy);
    onPinch.add(pinchSpy);

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerLeave(asPointer(pA));
    vi.advanceTimersByTime(600);

    // pA's own long-press was cancelled; pB (never left) still fires its own.
    const firedFor = longPressSpy.mock.calls.map(call => (call[0] as FakePointer).id);

    expect(firedFor).not.toContain(1);
    expect(firedFor).toContain(2);

    // Baseline was reset — a lone remaining touch pointer moving cannot
    // resume two-touch processing (size < 2 now).
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);
    expect(pinchSpy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('onPointerCancel cancels the pending long-press timer and (for touch) drops two-touch tracking', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);

    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'touch' });

    recognizer.onPointerDown(pointer);
    recognizer.onPointerCancel(pointer);
    vi.advanceTimersByTime(600);

    expect(spy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('onPointerLeave/onPointerCancel for a non-touch pointer does not touch two-touch tracking', () => {
    const { recognizer } = createHarness();
    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'mouse' });

    // Must not throw even though this pointer was never added to touchPointers.
    expect(() => {
      recognizer.onPointerDown(pointer);
      recognizer.onPointerLeave(pointer);
      recognizer.onPointerCancel(pointer);
    }).not.toThrow();

    recognizer.destroy();
  });

  test('moving beyond the distance threshold cancels the pending long-press', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);

    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    pointer.x = 100; // well beyond distanceThreshold=10
    recognizer.onPointerMove(asPointer(pointer), distanceThreshold);
    vi.advanceTimersByTime(600);

    expect(spy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('moving within the distance threshold does NOT cancel the pending long-press', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);

    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    pointer.x = 2; // within distanceThreshold=10
    recognizer.onPointerMove(asPointer(pointer), distanceThreshold);
    vi.advanceTimersByTime(600);

    expect(spy).toHaveBeenCalledTimes(1);

    recognizer.destroy();
  });

  test('a pointermove with no pending long-press entry (already fired/cancelled) is a safe no-op', () => {
    const { recognizer } = createHarness();
    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    vi.advanceTimersByTime(600); // long-press fires and removes its own entry

    expect(() => {
      pointer.x = 500;
      recognizer.onPointerMove(asPointer(pointer), distanceThreshold);
    }).not.toThrow();

    recognizer.destroy();
  });

  test('destroy() clears pending long-press timers so they never fire', () => {
    const { recognizer, onLongPress } = createHarness();
    const spy = vi.fn();

    onLongPress.add(spy);
    recognizer.onPointerDown(asPointer({ id: 1, x: 0, y: 0, type: 'touch' }));
    recognizer.destroy();

    vi.advanceTimersByTime(600);

    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Two-touch gestures (pinch / rotate)
// ---------------------------------------------------------------------------

describe('GestureRecognizer — two-touch gestures', () => {
  test('a single touch pointer moving does not attempt two-touch processing', () => {
    const { recognizer, onPinch, onRotate } = createHarness();
    const pinchSpy = vi.fn();
    const rotateSpy = vi.fn();

    onPinch.add(pinchSpy);
    onRotate.add(rotateSpy);

    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    pointer.x = 50;
    recognizer.onPointerMove(asPointer(pointer), distanceThreshold);

    expect(pinchSpy).not.toHaveBeenCalled();
    expect(rotateSpy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('a non-touch pointer moving is ignored by two-touch processing even when 2 touches are already down', () => {
    const { recognizer, onPinch } = createHarness();
    const pinchSpy = vi.fn();

    onPinch.add(pinchSpy);

    recognizer.onPointerDown(asPointer({ id: 1, x: 0, y: 0, type: 'touch' }));
    recognizer.onPointerDown(asPointer({ id: 2, x: 10, y: 0, type: 'touch' }));

    const mouse = { id: 3, x: 0, y: 0, type: 'mouse' };

    recognizer.onPointerDown(asPointer(mouse));
    mouse.x = 999;
    recognizer.onPointerMove(asPointer(mouse), distanceThreshold);

    expect(pinchSpy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('first move after both touches are down only establishes the baseline (no dispatch)', () => {
    const { recognizer, onPinch, onRotate } = createHarness();
    const pinchSpy = vi.fn();
    const rotateSpy = vi.fn();

    onPinch.add(pinchSpy);
    onRotate.add(rotateSpy);

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinchSpy).not.toHaveBeenCalled();
    expect(rotateSpy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('distance increasing (angle unchanged) fires onPinch with scale > 1 but not onRotate', () => {
    const { recognizer, onPinch, onRotate } = createHarness();
    const pinchSpy = vi.fn();
    const rotateSpy = vi.fn();

    onPinch.add(pinchSpy);
    onRotate.add(rotateSpy);

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline: distance=10, angle=0

    pB.x = 40; // distance=40 (scale=4), angle unchanged (0)
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinchSpy).toHaveBeenCalledTimes(1);
    const [scale] = pinchSpy.mock.calls[0] as [number, Vector];

    expect(scale).toBeCloseTo(4, 5);
    expect(rotateSpy).not.toHaveBeenCalled();

    recognizer.destroy();
  });

  test('angle changing (distance unchanged) fires onRotate but not onPinch', () => {
    const { recognizer, onPinch, onRotate } = createHarness();
    const pinchSpy = vi.fn();
    const rotateSpy = vi.fn();

    onPinch.add(pinchSpy);
    onRotate.add(rotateSpy);

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 40, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline: distance=40, angle=0

    pB.x = 0;
    pB.y = 40; // distance=sqrt(0+1600)=40 (unchanged), angle=atan2(40,0)=pi/2 (changed)
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinchSpy).not.toHaveBeenCalled();
    expect(rotateSpy).toHaveBeenCalledTimes(1);
    const [angleDelta] = rotateSpy.mock.calls[0] as [number, Vector];

    expect(angleDelta).toBeCloseTo(Math.PI / 2, 5);

    recognizer.destroy();
  });

  test('a move with neither distance nor angle change beyond epsilon fires neither signal', () => {
    const { recognizer, onPinch, onRotate } = createHarness();
    const pinchSpy = vi.fn();
    const rotateSpy = vi.fn();

    onPinch.add(pinchSpy);
    onRotate.add(rotateSpy);

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline

    // Re-dispatch with the exact same positions — well within the 0.0001 epsilon.
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinchSpy).not.toHaveBeenCalled();
    expect(rotateSpy).not.toHaveBeenCalled();

    recognizer.destroy();
  });
});
