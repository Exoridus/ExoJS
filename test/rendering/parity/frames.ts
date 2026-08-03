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
