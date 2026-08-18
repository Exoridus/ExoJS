/** Frame comparison shared by the properties. */

/**
 * Largest per-channel difference between two frames.
 *
 * Whole-frame rather than sampled: the point of a self-describing fixture is
 * that every pixel is predictable, so every pixel is worth comparing.
 */
export const maxChannelDelta = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length) {
    throw new Error(`Frames differ in size (${a.length} vs ${b.length}); they are not comparable.`);
  }

  let worst = 0;

  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i]! - b[i]!);

    if (delta > worst) worst = delta;
  }

  return worst;
};

/**
 * Pixels whose worst channel differs by more than `tolerance`.
 *
 * The companion to {@link maxChannelDelta} for the scenes that cannot be
 * bit-exact across adapters: the magnitude alone says nothing about whether a
 * handful of edge pixels drifted or the whole image moved.
 */
export const pixelsExceeding = (a: ArrayLike<number>, b: ArrayLike<number>, tolerance: number): number => {
  if (a.length !== b.length) {
    throw new Error(`Frames differ in size (${a.length} vs ${b.length}); they are not comparable.`);
  }

  let exceeding = 0;

  for (let i = 0; i < a.length; i += 4) {
    for (let channel = 0; channel < 4; channel++) {
      if (Math.abs(a[i + channel]! - b[i + channel]!) > tolerance) {
        exceeding++;
        break;
      }
    }
  }

  return exceeding;
};

/**
 * Pixels differing from an opaque black clear.
 *
 * Guards the blind spot the comparison properties share: a scene that draws
 * nothing produces two identical, perfectly deterministic empty frames and
 * passes every other check. Counting drawn pixels is what separates "the
 * backends agree" from "the backends agreed about nothing".
 */
export const drawnPixelCount = (frame: ArrayLike<number>): number => {
  let drawn = 0;

  for (let i = 0; i < frame.length; i += 4) {
    if (frame[i] !== 0 || frame[i + 1] !== 0 || frame[i + 2] !== 0) drawn++;
  }

  return drawn;
};
