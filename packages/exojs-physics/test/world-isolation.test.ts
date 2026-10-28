import { describe, expect, it } from 'vitest';

import type { CollisionEvent } from '../src/index';
import { BoxShape, PhysicsBody, physicsBuildInfo, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const DT = 1 / 60;

const overlappingPair = (world: PhysicsWorld): CollisionEvent[] => {
  colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
  world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

  const events: CollisionEvent[] = [];
  world.onCollisionStart.add(e => events.push(e));

  return events;
};

describe('multi-world isolation', () => {
  it.each(['body', 'collider'])('queued %s destruction cannot follow an object into another world after a failed dispatch', target => {
    const world = new PhysicsWorld();
    const other = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'static', colliders: [{ shape: new BoxShape(10, 10), isSensor: true }] }));
    const collider = body.colliders[0]!;

    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    world.onSensorEnter.once(() => {
      if (target === 'body') {
        world.destroyBody(body);
      } else {
        world.destroyCollider(collider);
      }

      throw new Error('observer failed');
    });

    expect(() => world.step(DT)).toThrow('observer failed');
    world.remove(body);
    other.add(body);

    expect(() => world.step(0)).toThrow(/world/);
    expect(body.destroyed).toBe(false);
    expect(collider.destroyed).toBe(false);
    expect(other.queryPoint({ x: 0, y: 0 })).toContain(collider);

    world.destroy();
    other.destroy();
  });

  it("rejects destruction of another world's body or collider without changing its owner", () => {
    const owner = new PhysicsWorld();
    const other = new PhysicsWorld();
    const body = owner.add(new PhysicsBody({ type: 'static', colliders: [{ shape: new BoxShape(10, 10) }] }));
    const collider = body.colliders[0]!;

    expect(() => other.destroyBody(body)).toThrow(/world/);
    expect(() => other.destroyCollider(collider)).toThrow(/world/);
    expect(body.destroyed).toBe(false);
    expect(collider.destroyed).toBe(false);
    expect(owner.bodies).toContain(body);
    expect(owner.queryPoint({ x: 0, y: 0 })).toEqual([collider]);

    owner.destroy();
    other.destroy();
  });

  it('restores immediate mutation after a collision observer throws', () => {
    const world = new PhysicsWorld();

    overlappingPair(world);
    world.onCollisionStart.add(() => {
      throw new Error('observer failed');
    });

    expect(() => world.step(DT)).toThrow('observer failed');

    const body = world.add(new PhysicsBody({ type: 'static', position: { x: 100, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    expect(world.bodies).toContain(body);
    expect(world.queryPoint({ x: 100, y: 0 })).toEqual(body.colliders);

    world.destroy();
  });

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
