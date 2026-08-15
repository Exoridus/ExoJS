/**
 * The capture-thrash rule itself, exercised directly rather than through one of
 * its two owners.
 *
 * Both a `RetainedContainer`'s fragment and a render root's representation drive
 * this machine, and each pins its own behaviour end to end. What neither can pin
 * is the machine in isolation: an edit that changes a transition here changes it
 * for both tiers at once, so the transitions get their own coverage.
 *
 * The owner's contract, reproduced by `drive` below: call `evaluate` exactly
 * once per DIRTY frame; on `InvalidateAndSuppress`, invalidate the product
 * (which runs `reset`) and then `suppress`.
 */

import { describe, expect, test } from 'vitest';

import { CaptureThrashSuppressor, CaptureVerdict } from '#rendering/plan/CaptureThrashSuppressor';

interface Frame {
  hasCapture: boolean;
  keyUnchanged: boolean;
}

/** Run one dirty frame through the owner-side protocol; `true` = capture skipped. */
const drive = (suppressor: CaptureThrashSuppressor, frame: Frame): boolean => {
  const verdict = suppressor.evaluate(frame.hasCapture, frame.keyUnchanged);

  if (verdict === CaptureVerdict.Capture) {
    return false;
  }

  if (verdict === CaptureVerdict.InvalidateAndSuppress) {
    suppressor.reset();
    suppressor.suppress();
  }

  return true;
};

describe('CaptureThrashSuppressor', () => {
  test('a fresh machine never suppresses', () => {
    const suppressor = new CaptureThrashSuppressor();

    expect(suppressor.suppressed).toBe(false);
    expect(drive(suppressor, { hasCapture: false, keyUnchanged: false })).toBe(false);
    expect(suppressor.suppressed).toBe(false);
  });

  test('a capture that WAS replayed clears the waste counter, however often it repeats', () => {
    const suppressor = new CaptureThrashSuppressor();

    for (let frame = 0; frame < 10; frame++) {
      suppressor.markCaptured();
      suppressor.markReplayed();

      expect(drive(suppressor, { hasCapture: true, keyUnchanged: false })).toBe(false);
    }

    expect(suppressor.suppressed).toBe(false);
  });

  test('one wasted capture is forgiven; the second opens the window', () => {
    const suppressor = new CaptureThrashSuppressor();

    suppressor.markCaptured();

    // Waste #1: the one-shot-mutation case, recaptured immediately.
    expect(drive(suppressor, { hasCapture: true, keyUnchanged: false })).toBe(false);
    expect(suppressor.suppressed).toBe(false);

    suppressor.markCaptured();

    // Waste #2: thrash.
    expect(drive(suppressor, { hasCapture: true, keyUnchanged: false })).toBe(true);
    expect(suppressor.suppressed).toBe(true);
  });

  test('a replay between two wasted captures resets the count, so the window never opens', () => {
    const suppressor = new CaptureThrashSuppressor();

    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false }); // waste #1

    suppressor.markCaptured();
    suppressor.markReplayed();
    drive(suppressor, { hasCapture: true, keyUnchanged: false }); // earned its keep

    suppressor.markCaptured();

    expect(drive(suppressor, { hasCapture: true, keyUnchanged: false })).toBe(false);
    expect(suppressor.suppressed).toBe(false);
  });

  test('a moving key keeps the window open indefinitely', () => {
    const suppressor = new CaptureThrashSuppressor();

    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false });
    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false });

    for (let frame = 0; frame < 50; frame++) {
      expect(drive(suppressor, { hasCapture: false, keyUnchanged: false })).toBe(true);
    }

    expect(suppressor.suppressed).toBe(true);
  });

  test('a key that stopped moving closes the window, and the recovery frame captures', () => {
    const suppressor = new CaptureThrashSuppressor();

    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false });
    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false });

    expect(suppressor.suppressed).toBe(true);

    // The frame that would have been clean if a capture still existed.
    expect(drive(suppressor, { hasCapture: false, keyUnchanged: true })).toBe(false);
    expect(suppressor.suppressed).toBe(false);
  });

  test('an unchanged key does NOT recover a machine that never entered the window', () => {
    const suppressor = new CaptureThrashSuppressor();

    suppressor.markCaptured();

    // Waste #1 with a settled key: still the grace frame, not a recovery.
    expect(drive(suppressor, { hasCapture: true, keyUnchanged: true })).toBe(false);
    expect(suppressor.suppressed).toBe(false);
  });

  test('reset clears the window, the waste count and the replay flag', () => {
    const suppressor = new CaptureThrashSuppressor();

    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false });
    suppressor.markCaptured();
    drive(suppressor, { hasCapture: true, keyUnchanged: false });

    expect(suppressor.suppressed).toBe(true);

    suppressor.reset();

    expect(suppressor.suppressed).toBe(false);

    // The waste count went with it: the next capture gets its grace frame back.
    suppressor.markCaptured();

    expect(drive(suppressor, { hasCapture: true, keyUnchanged: false })).toBe(false);
    expect(suppressor.suppressed).toBe(false);
  });
});
