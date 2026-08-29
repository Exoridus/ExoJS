import { createRng } from './rng';

/**
 * Canonical per-frame mutation SELECTION for a scene cell: the ordered list of
 * leaf indices in `[0, nodeCount)` whose sprites wobble every frame.
 *
 * Draws exactly one `rng()` value per leaf, in ascending index order, and selects
 * the leaf when the draw is below `mutationFraction`. The value is drawn for every
 * leaf even when `mutationFraction` is `0` (nothing selected), so any adapter
 * seeded identically consumes the identical stream position and reaches the same
 * selection - the cross-arm fairness contract (see `adapters/README.md`).
 *
 * Factoring the selection here, rather than re-inlining the RNG loop in every
 * engine adapter, turns that contract from prose into a single shared code path
 * and gives the harness a canonical set to assert each arm against.
 */
export const selectMutationIndices = (nodeCount: number, mutationFraction: number, seed: number): number[] => {
  const rng = createRng(seed);
  const selected: number[] = [];

  for (let index = 0; index < nodeCount; index++) {
    if (rng() < mutationFraction) {
      selected.push(index);
    }
  }

  return selected;
};

/**
 * Order-sensitive FNV-1a signature of a mutation-index list as an 8-hex-digit
 * string. Two arms that selected the identical indices in the identical order
 * produce the identical signature; any divergence - a different count, different
 * indices, or a different order - changes it. The list length is folded in first
 * so an empty selection never collides with a single-element one.
 *
 * This is the cross-arm determinism guard: the harness compares each
 * arm's reported signature against the canonical {@link selectMutationIndices}
 * signature for the same `(archetype, nodeCount, seed)` and fails loudly on a
 * mismatch, catching a reference adapter that draws its RNG differently.
 */
export const mutationSignature = (indices: readonly number[]): string => {
  // FNV-1a 32-bit: offset basis 0x811c9dc5, prime 0x01000193, via Math.imul.
  let hash = 0x811c9dc5;

  const mix = (byte: number): void => {
    hash ^= byte & 0xff;
    hash = Math.imul(hash, 0x01000193);
  };

  const mixUint32 = (value: number): void => {
    mix(value & 0xff);
    mix((value >>> 8) & 0xff);
    mix((value >>> 16) & 0xff);
    mix((value >>> 24) & 0xff);
  };

  mixUint32(indices.length);

  for (const index of indices) {
    mixUint32(index >>> 0);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** Peak per-axis displacement applied to a mutated leaf; small enough to never cross the viewport edge. */
const WOBBLE_AMPLITUDE = 2;

/** Phase step per frame for the mutation wobble. */
const WOBBLE_SPEED = 0.15;

/** Per-axis displacement a mutated leaf is moved by on a given frame. */
export interface WobbleOffset {
  /** X displacement, in world units. */
  readonly dx: number;
  /** Y displacement, in world units. */
  readonly dy: number;
}

/**
 * Displacement every arm applies to its selected leaves on `frame`.
 *
 * Shared for the same reason {@link selectMutationIndices} is, and with a sharper
 * edge: the SELECTION is asserted cross-arm through {@link mutationSignature},
 * but the amplitude is not. Four private copies of the same two constants could
 * drift without any check noticing, and the arms would then be moving the
 * identical leaves by different distances - a scene difference the matrix would
 * report as an engine difference.
 */
export const wobbleOffsetAt = (frame: number): WobbleOffset => {
  const phase = frame * WOBBLE_SPEED;

  return { dx: Math.sin(phase) * WOBBLE_AMPLITUDE, dy: Math.cos(phase) * WOBBLE_AMPLITUDE };
};
