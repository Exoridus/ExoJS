import { Random } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { aabbOverlap } from '../src/Aabb';
import { AabbTreeBroadPhase } from '../src/broadphase/AabbTreeBroadPhase';
import type { CandidatePair } from '../src/broadphase/BroadPhase';
import type { Collider } from '../src/Collider';
import { BoxShape, CircleShape, PhysicsWorld } from '../src/index';
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

/** Brute-force O(n^2) reference: every true AABB-overlapping pair, as `"loId:hiId"` strings. */
const bruteForcePairs = (colliders: readonly Collider[]): Set<string> => {
  const out = new Set<string>();

  for (let i = 0; i < colliders.length; i++) {
    for (let j = i + 1; j < colliders.length; j++) {
      const a = colliders[i]!;
      const b = colliders[j]!;

      if (aabbOverlap(a.aabb, b.aabb)) {
        out.add(a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
      }
    }
  }

  return out;
};

describe('AabbTreeBroadPhase', () => {
  it('reports every true AABB overlap (zero false negatives) and no false positives', () => {
    const colliders = grid(8, 5, 8); // 10px boxes 8px apart → neighbours overlap
    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];

    broadPhase.computePairs(colliders, out);

    expect(new Set(out.map(key))).toEqual(bruteForcePairs(colliders));
  });

  it('produces a deterministic, id-sorted candidate order regardless of input array order', () => {
    const colliders = grid(6, 4, 7);
    const first: CandidatePair[] = [];
    const second: CandidatePair[] = [];

    new AabbTreeBroadPhase().computePairs(colliders, first);
    new AabbTreeBroadPhase().computePairs([...colliders].reverse(), second);

    expect(first.map(key)).toEqual(second.map(key));

    const sorted = [...first].sort((p, q) => p.a.id - q.a.id || p.b.id - q.b.id).map(key);
    expect(first.map(key)).toEqual(sorted);
  });

  it('each pair is ordered a.id < b.id', () => {
    const colliders = grid(5, 5, 8);
    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];

    broadPhase.computePairs(colliders, out);

    for (const pair of out) {
      expect(pair.a.id).toBeLessThan(pair.b.id);
    }
  });

  it('is stateful: candidate pairs update as colliders move across steps', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const b = colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 });
    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];
    const pairId = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;

    broadPhase.computePairs(world.colliders, out);
    expect(out.map(key)).toEqual([]);

    b.body.setTransform({ x: 5, y: 0 });
    broadPhase.computePairs(world.colliders, out);
    expect(out.map(key)).toEqual([pairId]);

    b.body.setTransform({ x: 100, y: 0 });
    broadPhase.computePairs(world.colliders, out);
    expect(out.map(key)).toEqual([]);
  });

  it('drops pairs referencing a collider once removeCollider is called', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const b = colliderAt(world, new BoxShape(10, 10), { x: 5, y: 0 });
    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];

    broadPhase.computePairs([a, b], out);
    expect(out.length).toBe(1);

    broadPhase.removeCollider(a);
    broadPhase.computePairs([b], out);
    expect(out.length).toBe(0);
  });

  it('matches the brute-force oracle across many randomized, evolving configurations', () => {
    const rng = new Random(20260714);
    const world = new PhysicsWorld();
    const colliders: Collider[] = [];
    const shapeSizes = [4, 8, 16, 40]; // mixes dense clusters and sparse fields

    for (let i = 0; i < 60; i++) {
      const size = shapeSizes[Math.floor(rng.next(0, shapeSizes.length))]!;
      const shape = rng.next() < 0.3 ? new CircleShape(size / 2) : new BoxShape(size, size);
      colliders.push(colliderAt(world, shape, { x: rng.next(0, 200), y: rng.next(0, 200) }, 0, 'dynamic'));
    }

    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];

    for (let step = 0; step < 40; step++) {
      // Move a random subset each step — exercises both the sync phase's
      // no-op fast path (colliders that stay put) and real reinsertions.
      for (const collider of colliders) {
        if (rng.next() < 0.4) {
          collider.body.setTransform({ x: rng.next(0, 200), y: rng.next(0, 200) });
        }
      }

      broadPhase.computePairs(world.colliders, out);

      expect(new Set(out.map(key))).toEqual(bruteForcePairs(world.colliders));
    }
  });
});
