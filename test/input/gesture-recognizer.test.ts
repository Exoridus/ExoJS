/**
 * Direct unit tests for GestureRecognizer (long-press timing, two-touch
 * pinch/rotate derivation). Constructed standalone — no InputManager/DOM
 * involved — for precise control over pointer positions and timer advance.
 *
 * GestureRecognizer holds no Signal of its own: every occurrence is handed to
 * the `_enqueue` callback supplied at construction (in production, that
 * pushes onto InputManager's frame journal). These tests capture that
 * callback into a plain array and assert directly on the emitted
 * `GestureJournalEvent` objects — the same path production actually runs,
 * rather than a parallel test-only dispatch fallback.
 */

import { type GestureJournalEvent, GestureRecognizer } from '#input/GestureRecognizer';
import type { Pointer } from '#input/Pointer';

interface FakePointer {
  id: number;
  x: number;
  y: number;
  type: string;
}

const asPointer = (p: FakePointer): Pointer => p as unknown as Pointer;

const distanceThreshold = 10;

type PinchEvent = Extract<GestureJournalEvent, { kind: 'pinch' }>;
type RotateEvent = Extract<GestureJournalEvent, { kind: 'rotate' }>;
type LongPressEvent = Extract<GestureJournalEvent, { kind: 'longpress' }>;

interface Harness {
  recognizer: GestureRecognizer;
  events: GestureJournalEvent[];
}

const createHarness = (): Harness => {
  const events: GestureJournalEvent[] = [];
  const recognizer = new GestureRecognizer(distanceThreshold, event => events.push(event));

  return { recognizer, events };
};

const pinches = (events: GestureJournalEvent[]): PinchEvent[] => events.filter((e): e is PinchEvent => e.kind === 'pinch');
const rotates = (events: GestureJournalEvent[]): RotateEvent[] => events.filter((e): e is RotateEvent => e.kind === 'rotate');
const longPresses = (events: GestureJournalEvent[]): LongPressEvent[] => events.filter((e): e is LongPressEvent => e.kind === 'longpress');

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
  test('enqueues a longpress event after 500ms for a touch pointer held still', () => {
    const { recognizer, events } = createHarness();
    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'touch' });

    recognizer.onPointerDown(pointer);
    expect(longPresses(events)).toHaveLength(0);

    vi.advanceTimersByTime(500);

    expect(longPresses(events)).toHaveLength(1);
    expect(longPresses(events)[0]!.pointer).toBe(pointer);

    recognizer.destroy();
  });

  test('enqueues a longpress event for a mouse pointer too (long-press is not touch-only)', () => {
    const { recognizer, events } = createHarness();
    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'mouse' });

    recognizer.onPointerDown(pointer);
    vi.advanceTimersByTime(500);

    expect(longPresses(events)).toHaveLength(1);

    recognizer.destroy();
  });

  test('does not enqueue before 500ms elapses', () => {
    const { recognizer, events } = createHarness();

    recognizer.onPointerDown(asPointer({ id: 1, x: 0, y: 0, type: 'touch' }));
    vi.advanceTimersByTime(499);

    expect(longPresses(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('onPointerUp cancels the pending long-press timer', () => {
    const { recognizer, events } = createHarness();
    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'touch' });

    recognizer.onPointerDown(pointer);
    recognizer.onPointerUp(pointer);
    vi.advanceTimersByTime(600);

    expect(longPresses(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test("onPointerLeave cancels that pointer's pending long-press timer and (for touch) drops two-touch tracking", () => {
    const { recognizer, events } = createHarness();

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerLeave(asPointer(pA));
    vi.advanceTimersByTime(600);

    // pA's own long-press was cancelled; pB (never left) still fires its own.
    const firedFor = longPresses(events).map(e => (e.pointer as unknown as FakePointer).id);

    expect(firedFor).not.toContain(1);
    expect(firedFor).toContain(2);

    // Baseline was reset — a lone remaining touch pointer moving cannot
    // resume two-touch processing (size < 2 now).
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);
    expect(pinches(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('onPointerCancel cancels the pending long-press timer and (for touch) drops two-touch tracking', () => {
    const { recognizer, events } = createHarness();
    const pointer = asPointer({ id: 1, x: 0, y: 0, type: 'touch' });

    recognizer.onPointerDown(pointer);
    recognizer.onPointerCancel(pointer);
    vi.advanceTimersByTime(600);

    expect(longPresses(events)).toHaveLength(0);

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
    const { recognizer, events } = createHarness();
    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    pointer.x = 100; // well beyond distanceThreshold=10
    recognizer.onPointerMove(asPointer(pointer), distanceThreshold);
    vi.advanceTimersByTime(600);

    expect(longPresses(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('moving within the distance threshold does NOT cancel the pending long-press', () => {
    const { recognizer, events } = createHarness();
    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    pointer.x = 2; // within distanceThreshold=10
    recognizer.onPointerMove(asPointer(pointer), distanceThreshold);
    vi.advanceTimersByTime(600);

    expect(longPresses(events)).toHaveLength(1);

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
    const { recognizer, events } = createHarness();

    recognizer.onPointerDown(asPointer({ id: 1, x: 0, y: 0, type: 'touch' }));
    recognizer.destroy();

    vi.advanceTimersByTime(600);

    expect(longPresses(events)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Two-touch gestures (pinch / rotate)
// ---------------------------------------------------------------------------

describe('GestureRecognizer — two-touch gestures', () => {
  test('a single touch pointer moving does not attempt two-touch processing', () => {
    const { recognizer, events } = createHarness();
    const pointer = { id: 1, x: 0, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pointer));
    pointer.x = 50;
    recognizer.onPointerMove(asPointer(pointer), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);
    expect(rotates(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('a non-touch pointer moving is ignored by two-touch processing even when 2 touches are already down', () => {
    const { recognizer, events } = createHarness();

    recognizer.onPointerDown(asPointer({ id: 1, x: 0, y: 0, type: 'touch' }));
    recognizer.onPointerDown(asPointer({ id: 2, x: 10, y: 0, type: 'touch' }));

    const mouse = { id: 3, x: 0, y: 0, type: 'mouse' };

    recognizer.onPointerDown(asPointer(mouse));
    mouse.x = 999;
    recognizer.onPointerMove(asPointer(mouse), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('first move after both touches are down only establishes the baseline (no dispatch)', () => {
    const { recognizer, events } = createHarness();

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);
    expect(rotates(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('distance increasing (angle unchanged) enqueues a pinch with scale > 1 but no rotate', () => {
    const { recognizer, events } = createHarness();

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline: distance=10, angle=0

    pB.x = 40; // distance=40 (scale=4), angle unchanged (0)
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(1);
    expect(pinches(events)[0]!.scale).toBeCloseTo(4, 5);
    expect(rotates(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('angle changing (distance unchanged) enqueues a rotate but no pinch', () => {
    const { recognizer, events } = createHarness();

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 40, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline: distance=40, angle=0

    pB.x = 0;
    pB.y = 40; // distance=sqrt(0+1600)=40 (unchanged), angle=atan2(40,0)=pi/2 (changed)
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);
    expect(rotates(events)).toHaveLength(1);
    expect(rotates(events)[0]!.angleDelta).toBeCloseTo(Math.PI / 2, 5);

    recognizer.destroy();
  });

  test('a move with neither distance nor angle change beyond epsilon enqueues neither', () => {
    const { recognizer, events } = createHarness();

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline

    // Re-dispatch with the exact same positions — well within the 0.0001 epsilon.
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);
    expect(rotates(events)).toHaveLength(0);

    recognizer.destroy();
  });

  test('onPointerUp removes that touch from the active two-touch set so a later move from the remaining touch cannot synthesize a pinch', () => {
    const { recognizer, events } = createHarness();

    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: 10, y: 0, type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline
    recognizer.onPointerUp(asPointer(pA));

    // Only pB remains tracked — a lone touch moving must not attempt
    // two-touch processing (size < 2 now that pA was lifted).
    pB.x = 40;
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);
    expect(rotates(events)).toHaveLength(0);

    recognizer.destroy();
  });
});

// ---------------------------------------------------------------------------
// Rotation delta: shortest signed arc
// ---------------------------------------------------------------------------

describe('GestureRecognizer — rotation shortest-signed-arc normalization', () => {
  const toDeg = (radians: number): number => radians * (180 / Math.PI);
  const toRad = (degrees: number): number => degrees * (Math.PI / 180);

  test('+179° -> -179° reports ≈ +2°, not the naive -358°', () => {
    const { recognizer, events } = createHarness();

    const radius = 100;
    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: radius * Math.cos(toRad(179)), y: radius * Math.sin(toRad(179)), type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline: angle=+179°, distance=radius

    // Same distance, angle crosses the +180/-180 seam to -179°.
    pB.x = radius * Math.cos(toRad(-179));
    pB.y = radius * Math.sin(toRad(-179));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(0); // distance unchanged — isolates the rotation delta
    expect(rotates(events)).toHaveLength(1);
    expect(toDeg(rotates(events)[0]!.angleDelta)).toBeCloseTo(2, 5);

    recognizer.destroy();
  });

  test('-179° -> +179° reports ≈ -2°, the mirror-image wrap', () => {
    const { recognizer, events } = createHarness();

    const radius = 100;
    const pA = { id: 1, x: 0, y: 0, type: 'touch' };
    const pB = { id: 2, x: radius * Math.cos(toRad(-179)), y: radius * Math.sin(toRad(-179)), type: 'touch' };

    recognizer.onPointerDown(asPointer(pA));
    recognizer.onPointerDown(asPointer(pB));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold); // baseline: angle=-179°, distance=radius

    pB.x = radius * Math.cos(toRad(179));
    pB.y = radius * Math.sin(toRad(179));
    recognizer.onPointerMove(asPointer(pB), distanceThreshold);

    expect(pinches(events)).toHaveLength(0);
    expect(rotates(events)).toHaveLength(1);
    expect(toDeg(rotates(events)[0]!.angleDelta)).toBeCloseTo(-2, 5);

    recognizer.destroy();
  });
});
