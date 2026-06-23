import type { Collider } from '../Collider';
import type { BroadPhase, CandidatePair } from './BroadPhase';

/**
 * Sort-and-sweep broad phase on the X axis. Each query sorts the live colliders
 * by their AABB `minX`, then sweeps once, comparing each collider only against
 * those whose X intervals still overlap and confirming the Y interval. This is
 * an exact AABB-overlap broad phase (zero false negatives) with a deterministic,
 * id-sorted output. The recompute-each-step design keeps it stateless between
 * frames — two worlds never share sweep state (gate I-1).
 */
export class SweepAndPrune implements BroadPhase {
  private readonly _sorted: Collider[] = [];

  public computePairs(colliders: readonly Collider[], out: CandidatePair[]): CandidatePair[] {
    out.length = 0;

    const sorted = this._sorted;
    sorted.length = 0;

    for (const collider of colliders) {
      sorted.push(collider);
    }

    sorted.sort(byMinX);

    const count = sorted.length;

    for (let i = 0; i < count; i++) {
      // i/j stay within 0..count-1, so the entries always exist; the guards only
      // discharge `noUncheckedIndexedAccess` and never actually skip a collider.
      const a = sorted[i];

      if (a === undefined) {
        continue;
      }

      const aBox = a.aabb;
      const aMaxX = aBox.maxX;
      const aMinY = aBox.minY;
      const aMaxY = aBox.maxY;

      for (let j = i + 1; j < count; j++) {
        const b = sorted[j];

        if (b === undefined) {
          continue;
        }

        const bBox = b.aabb;

        // X intervals are sorted: once b starts past a's right edge, so do all
        // later colliders — stop scanning this i.
        if (bBox.minX > aMaxX) {
          break;
        }

        if (bBox.minY > aMaxY || bBox.maxY < aMinY) {
          continue;
        }

        out.push(a.id < b.id ? { a, b } : { a: b, b: a });
      }
    }

    out.sort(byPairId);

    return out;
  }
}

const byMinX = (a: Collider, b: Collider): number => a.aabb.minX - b.aabb.minX || a.id - b.id;

const byPairId = (p: CandidatePair, q: CandidatePair): number => p.a.id - q.a.id || p.b.id - q.b.id;
