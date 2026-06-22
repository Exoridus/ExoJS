import { describe, expect, it } from 'vitest';

import type { CollisionEvent } from '../src/index';
import { BoxShape, PhysicsBody, physicsBuildInfo,PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const DT = 1 / 60;

const overlappingPair = (world: PhysicsWorld): CollisionEvent[] => {
  colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
  world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

  const events: CollisionEvent[] = [];
  world.onCollisionStart.add(e => events.push(e));

  return events;
};

describe('multi-world isolation (gate I-1)', () => {
  it('two concurrent worlds produce independent, identical-to-solo results', () => {
    const solo = new PhysicsWorld();
    const soloEvents = overlappingPair(solo);
    solo.step(DT);

    const a = new PhysicsWorld();
    const b = new PhysicsWorld();
    const aEvents = overlappingPair(a);
    const bEvents = overlappingPair(b);

    // Interleave stepping the two worlds.
    a.step(DT);
    b.step(DT);

    expect(aEvents).toHaveLength(soloEvents.length);
    expect(bEvents).toHaveLength(soloEvents.length);
    expect(aEvents).toHaveLength(1);
  });

  it('destroying one world does not affect another', () => {
    const a = new PhysicsWorld();
    const b = new PhysicsWorld();
    const bEvents = overlappingPair(b);

    a.destroy();

    expect(() => b.step(DT)).not.toThrow();
    expect(bEvents).toHaveLength(1);
  });

  it('ids restart per world (no shared module-level counter)', () => {
    const a = new PhysicsWorld();
    const b = new PhysicsWorld();
    const colliderA = colliderAt(a, new BoxShape(10, 10), { x: 0, y: 0 });
    const colliderB = colliderAt(b, new BoxShape(10, 10), { x: 0, y: 0 });

    expect(colliderA.id).toBe(colliderB.id);
  });

  it('exposes frozen build info', () => {
    expect(Object.isFrozen(physicsBuildInfo)).toBe(true);
    expect(typeof physicsBuildInfo.version).toBe('string');
    expect(typeof physicsBuildInfo.development).toBe('boolean');
  });
});
