import type { Collider } from '../Collider';

/** An unordered pair of colliders whose AABBs the broad phase reports as overlapping. */
export interface CandidatePair {
  a: Collider;
  b: Collider;
}

/**
 * Broad-phase contract: reduce the O(n²) all-pairs test to a candidate set of
 * AABB-overlapping pairs. The candidate set must contain **every** truly
 * overlapping pair (zero false negatives, gate B-3); false positives are
 * resolved by the narrow phase. This interface is the seam behind which the MVP
 * ships {@link SweepAndPrune} and a future dynamic-AABB-tree can be swapped in
 * without touching callers.
 */
export interface BroadPhase {
  /**
   * Fill `out` with the candidate pairs for the current collider set and return
   * it. Each pair is ordered `a.id < b.id`, and the array is sorted by
   * `(a.id, b.id)` for deterministic downstream processing.
   */
  computePairs(colliders: readonly Collider[], out: CandidatePair[]): CandidatePair[];
}
