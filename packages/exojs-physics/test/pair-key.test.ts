import { describe, expect, it } from 'vitest';

import { Collider } from '../src/Collider';
import { ContactGraph,pairKey,pairKeyStride } from '../src/ContactGraph';
import { createTransform } from '../src/math';
import { PhysicsBody } from '../src/PhysicsBody';
import { CircleShape } from '../src/shapes/CircleShape';

/**
 * A4: the contact pair key packs two collider ids into one integer. The old
 * `(aId << 16) | bId` overflowed once any id reached 65536 (JS bitwise ops are
 * 32-bit), silently colliding distinct pairs. Ids are allocated monotonically
 * and never recycled, so a long-running world with heavy spawn/destroy churn
 * can reach that limit.
 */
describe('ContactGraph pairKey (A4 16-bit overflow fix)', () => {
  it('produces a distinct key for every distinct ordered id pair, including ids past 65535', () => {
    const ids = [1, 2, 65_535, 65_536, 65_537, 100_000, 1_000_000];
    const keys = new Set<number>();

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        keys.add(pairKey(ids[i], ids[j]));
      }
    }

    // C(7,2) = 21 pairs, all keys distinct.
    expect(keys.size).toBe(21);
  });

  it('stays within the safe-integer range for large ids', () => {
    const key = pairKey(1_000_000, 2_000_000);

    expect(Number.isSafeInteger(key)).toBe(true);
    expect(key).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it('regression: the old 16-bit scheme collided where the new one does not', () => {
    const oldKey = (aId: number, bId: number): number => (aId << 16) | bId;

    // id 65536 wraps to 0 under `<< 16`, colliding pair (65536, 5) with (0, 5).
    expect(oldKey(65_536, 5)).toBe(oldKey(0, 5));
    expect(pairKey(65_536, 5)).not.toBe(pairKey(0, 5));
    expect(pairKeyStride).toBe(2 ** 26);
  });
});

/**
 * `ContactGraph.update()`'s `makeSensorEvent` tie-break (which collider is the
 * "sensor" when both overlapping colliders are sensors) leans on the broad
 * phase's documented invariant that every `CandidatePair` has `a.id < b.id`. In
 * every real step that invariant holds, so the ternary's "b wins" branch is
 * dead in practice. `update()` is a public method that accepts a plain
 * `CandidatePair[]` and does not itself re-validate the ordering, so this
 * white-box test constructs a graph directly and feeds it a deliberately
 * reversed pair to pin that the tie-break still resolves to the numerically
 * lower id — the defensive branch a SweepAndPrune-fed pair never reaches.
 */
describe('ContactGraph.update sensor tie-break (both colliders are sensors)', () => {
  it('resolves the sensor to the lower-id collider even when the pair is passed in the opposite order', () => {
    const graph = new ContactGraph();
    const higherIdSensor = new Collider({ shape: new CircleShape(10), isSensor: true });
    const lowerIdSensor = new Collider({ shape: new CircleShape(10), isSensor: true });

    higherIdSensor._attach(new PhysicsBody(), 9);
    lowerIdSensor._attach(new PhysicsBody(), 3);
    higherIdSensor.synchronize(createTransform(0, 0, 0));
    lowerIdSensor.synchronize(createTransform(0, 0, 0));

    // Reverse of the documented order: `a` is the higher id.
    graph.update([{ a: higherIdSensor, b: lowerIdSensor }]);

    expect(graph.sensorEnter).toHaveLength(1);
    expect(graph.sensorEnter[0]!.sensor).toBe(lowerIdSensor);
    expect(graph.sensorEnter[0]!.other).toBe(higherIdSensor);
  });
});
