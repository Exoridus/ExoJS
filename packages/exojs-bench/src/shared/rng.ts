/**
 * Deterministic pseudo-random generator shared across benchmark domains.
 *
 * Lives in `shared/` (not any one domain) because every domain's cross-arm
 * fairness contract needs the SAME seeded stream: the rendering domain draws it
 * to select which sprites mutate per frame (see `shared/mutation.ts`), and a
 * future physics domain would draw it to pick which bodies to perturb. Keeping a
 * single implementation here is what lets `mutationSignature` assert byte-for-byte
 * identical selection across arms.
 */

/** mulberry32 — small, fast, deterministic. Same seed => same stream. */
export const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
