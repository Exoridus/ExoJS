import type { PhysicsStructuralCounters } from '../physics/PhysicsAdapter';
import type { StructuralCounters } from '../rendering/EngineAdapter';

/**
 * Mechanism attribution for a comparison row.
 *
 * Every published row has to name WHY the two arms differ, drawn from the
 * structural counters the harness already collects. A number without a mechanism
 * is marketing; a number with one is a finding - and the rule doubles as a brake
 * against publishing a row nobody actually understood, since a mechanism that
 * cannot be evidenced keeps the row out of the table entirely.
 *
 * `null` is therefore a meaningful result and never an inconvenience to work
 * around: it says this pair of cells carries no structural evidence, which is the
 * case whenever an arm reported no counters at all (the Phaser arm renders a
 * WebGL1 context the probe cannot attach to).
 */

/** How far apart two counters must be before the difference is attributed to them rather than to CPU work. */
const ATTRIBUTION_FACTOR = 1.5;

/**
 * Smallest counter value that can carry an attribution.
 *
 * Without a floor the ratio test fires on noise-sized differences - "fewer buffer
 * uploads (0 vs 1 per frame)" was offered as the mechanism behind a 26x CPU gap,
 * which is not an explanation, it is a coincidence that happened to pass a ratio
 * test. A handful of draw calls or uploads cannot account for a millisecond of CPU
 * time on either arm, so below this the honest answer is that the structure is
 * effectively the same and the difference is CPU-side.
 */
const MIN_ATTRIBUTION_COUNT = 8;

/** One named counter of a structural comparison. */
interface CounterPair {
  /** Counter name as it appears in the mechanism sentence. */
  readonly label: string;
  /** ExoJS arm's value. */
  readonly exojs: number;
  /** Competitor arm's value. */
  readonly competitor: number;
}

/** The first counter whose two values differ by at least {@link ATTRIBUTION_FACTOR}, or `null` when none does. */
const dominantCounter = (pairs: readonly CounterPair[]): CounterPair | null => {
  for (const pair of pairs) {
    const low = Math.min(pair.exojs, pair.competitor);
    const high = Math.max(pair.exojs, pair.competitor);

    if (high < MIN_ATTRIBUTION_COUNT) {
      continue;
    }

    if (low > 0 && high / low >= ATTRIBUTION_FACTOR) {
      return pair;
    }

    // A counter that is zero on one arm and nonzero on the other is the starkest
    // form of the same finding, and the ratio test cannot see it.
    if (low === 0) {
      return pair;
    }
  }

  return null;
};

/** Mechanism sentence for a rendering row, or `null` when neither arm reported counters. */
export const renderingMechanism = (exojs: StructuralCounters | null, competitor: StructuralCounters | null): string | null => {
  if (exojs === null || competitor === null) {
    return null;
  }

  // A cell that issued no draw call at all did not render the archetype, so its
  // counters describe nothing.
  if (exojs.drawCalls === 0 && competitor.drawCalls === 0) {
    return null;
  }

  const dominant = dominantCounter([
    { label: 'draw calls', exojs: exojs.drawCalls, competitor: competitor.drawCalls },
    { label: 'buffer uploads', exojs: exojs.bufferUploads, competitor: competitor.bufferUploads },
    { label: 'texture binds', exojs: exojs.textureBinds, competitor: competitor.textureBinds },
  ]);

  if (dominant !== null) {
    const leader = dominant.exojs < dominant.competitor ? 'ExoJS' : 'competitor';

    return `${leader} issues fewer ${dominant.label} (${dominant.exojs} vs ${dominant.competitor} per frame)`;
  }

  return `structurally equivalent at this scale (draw/bind/upload per frame: ${exojs.drawCalls}/${exojs.textureBinds}/${exojs.bufferUploads} vs ${competitor.drawCalls}/${competitor.textureBinds}/${competitor.bufferUploads}, none of them large enough to account for the gap); the difference is CPU-side`;
};

/** Mechanism sentence for a physics row, or `null` when the counters describe nothing. */
export const physicsMechanism = (exojs: PhysicsStructuralCounters | null, competitor: PhysicsStructuralCounters | null): string | null => {
  if (exojs === null || competitor === null) {
    return null;
  }

  const dominant = dominantCounter([
    { label: 'solved contacts', exojs: exojs.contactCount, competitor: competitor.contactCount },
    { label: 'live bodies', exojs: exojs.bodyCount, competitor: competitor.bodyCount },
  ]);

  if (dominant !== null) {
    const leader = dominant.exojs < dominant.competitor ? 'ExoJS' : 'competitor';

    return `${leader} resolves fewer ${dominant.label} (${dominant.exojs} vs ${dominant.competitor}); the counters are not semantically identical across arms (see the run's caveats)`;
  }

  const shared = `${exojs.bodyCount} bodies, ${exojs.contactCount} contacts, ${exojs.jointCount} joints on both arms`;

  return exojs.rayHits > 0 || competitor.rayHits > 0
    ? `identical scene (${shared}) with ${exojs.rayHits} vs ${competitor.rayHits} ray hits per step; the difference is query and solver cost`
    : `identical scene (${shared}); the difference is solver cost`;
};
