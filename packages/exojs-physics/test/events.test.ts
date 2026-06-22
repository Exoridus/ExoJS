import { describe, expect, it, vi } from 'vitest';

import type { CollisionEvent, SensorEvent } from '../src/index';
import { BoxShape, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const DT = 1 / 60;

describe('contact events', () => {
  it('fires collisionStart once on overlap and collisionEnd on separation', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const movingBody = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    const starts: CollisionEvent[] = [];
    const ends: CollisionEvent[] = [];
    world.onCollisionStart.add(e => starts.push(e));
    world.onCollisionEnd.add(e => ends.push(e));

    world.step(DT);
    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(0);

    // Still overlapping — no duplicate start.
    world.step(DT);
    expect(starts).toHaveLength(1);

    // Move apart → end.
    movingBody.setTransform({ x: 40, y: 0 });
    world.step(DT);
    expect(ends).toHaveLength(1);
  });

  it('produces frozen, immutable event snapshots with an A→B normal', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    let event: CollisionEvent | null = null;
    world.onCollisionStart.add(e => {
      event = e;
    });
    world.step(DT);

    expect(event).not.toBeNull();
    const captured = event as unknown as CollisionEvent;
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.normal)).toBe(true);
    expect(Object.isFrozen(captured.points)).toBe(true);
    expect(Math.hypot(captured.normal.x, captured.normal.y)).toBeCloseTo(1, 6);
    expect(captured.points.length).toBeGreaterThan(0);
  });

  it('fires sensorEnter / sensorExit without a collision event', () => {
    const world = new PhysicsWorld();
    const sensor = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 }, 0, 'static', { isSensor: true });
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    const enters: SensorEvent[] = [];
    const exits: SensorEvent[] = [];
    const collisions: CollisionEvent[] = [];
    world.onSensorEnter.add(e => enters.push(e));
    world.onSensorExit.add(e => exits.push(e));
    world.onCollisionStart.add(e => collisions.push(e));

    world.step(DT);
    expect(enters).toHaveLength(1);
    expect(enters[0].sensor).toBe(sensor);
    expect(collisions).toHaveLength(0);

    body.setTransform({ x: 80, y: 0 });
    world.step(DT);
    expect(exits).toHaveLength(1);
  });

  it('defers body destruction requested inside a callback', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const projectile = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    world.onCollisionStart.add(() => {
      // Deferred: must not throw or corrupt the live arrays mid-dispatch.
      expect(() => world.destroyBody(projectile)).not.toThrow();
    });

    expect(() => world.step(DT)).not.toThrow();
    expect(projectile.destroyed).toBe(true);
    expect(world.bodies).not.toContain(projectile);
  });

  it('does not fire events for filtered-out pairs', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { category: 0x0001, mask: 0x0001 } });
    const other = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10), filter: { category: 0x0002, mask: 0x0002 } }] }),
    );

    const start = vi.fn();
    world.onCollisionStart.add(start);
    world.step(DT);

    expect(start).not.toHaveBeenCalled();
  });
});
