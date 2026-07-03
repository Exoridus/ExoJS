import { describe, expect, it } from 'vitest';

import { aabbOverlap } from '../src/Aabb';
import type { CandidatePair } from '../src/broadphase/BroadPhase';
import { SweepAndPrune } from '../src/broadphase/SweepAndPrune';
import type { Collider } from '../src/Collider';
import { BoxShape, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const key = (pair: CandidatePair): string => `${pair.a.id}:${pair.b.id}`;

const grid = (cols: number, rows: number, spacing: number): Collider[] => {
  const world = new PhysicsWorld();
  const colliders: Collider[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      colliders.push(colliderAt(world, new BoxShape(10, 10), { x: x * spacing, y: y * spacing }));
    }
  }

  return colliders;
};

describe('SweepAndPrune', () => {
  it('reports every true AABB overlap (zero false negatives) and no false positives', () => {
    const colliders = grid(8, 5, 8); // 10px boxes 8px apart → neighbours overlap
    const sap = new SweepAndPrune();
    const out: CandidatePair[] = [];

    sap.computePairs(colliders, out);
    const candidates = new Set(out.map(key));

    let trueOverlaps = 0;

    for (let i = 0; i < colliders.length; i++) {
      for (let j = i + 1; j < colliders.length; j++) {
        const a = colliders[i];
        const b = colliders[j];
        const expected = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;

        if (aabbOverlap(a.aabb, b.aabb)) {
          trueOverlaps++;
          expect(candidates.has(expected)).toBe(true);
        } else {
          // SAP is exact for AABBs — no false positives either.
          expect(candidates.has(expected)).toBe(false);
        }
      }
    }

    expect(out.length).toBe(trueOverlaps);
  });

  it('produces a deterministic, id-sorted candidate order', () => {
    const colliders = grid(6, 4, 7);
    const first: CandidatePair[] = [];
    const second: CandidatePair[] = [];

    new SweepAndPrune().computePairs(colliders, first);
    new SweepAndPrune().computePairs([...colliders].reverse(), second);

    expect(first.map(key)).toEqual(second.map(key));

    const sorted = [...first].sort((p, q) => p.a.id - q.a.id || p.b.id - q.b.id).map(key);
    expect(first.map(key)).toEqual(sorted);
  });

  it('each pair is ordered a.id < b.id', () => {
    const colliders = grid(5, 5, 8);
    const out: CandidatePair[] = [];

    new SweepAndPrune().computePairs(colliders, out);

    for (const pair of out) {
      expect(pair.a.id).toBeLessThan(pair.b.id);
    }
  });
});
