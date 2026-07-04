import { describe, expect, it, vi } from 'vitest';

import type { Collider, CollisionEvent, SensorEvent } from '../src/index';
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

  it('a body added and destroyed within the same dispatch is never pushed to the live list', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    let created: PhysicsBody | null = null;
    world.onCollisionStart.add(() => {
      // Both the body push (world.add) and the collider registration it triggers
      // are deferred while dispatching; marking it destroyed before commands
      // drain must suppress that deferred push (PhysicsWorld._registerCollider /
      // the body-add command's `!body.destroyed` guard).
      created = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(5, 5) }] }));
      created._markDestroyed();
    });

    expect(() => world.step(DT)).not.toThrow();
    const body = created as unknown as PhysicsBody;
    expect(body).not.toBeNull();
    expect(world.bodies).not.toContain(body);
  });

  it('a collider added and destroyed within the same dispatch is never registered', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 8, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    let addedCollider: Collider | null = null;
    world.onCollisionStart.add(() => {
      // An already-attached body's addCollider defers registration through
      // PhysicsWorld._registerCollider while dispatching; destroying the
      // collider immediately must suppress that deferred push.
      const body = world.add(new PhysicsBody({ type: 'static', position: { x: 100, y: 100 } }));
      addedCollider = body.addCollider({ shape: new BoxShape(5, 5) });
      addedCollider._markDestroyed();
    });

    expect(() => world.step(DT)).not.toThrow();
    const collider = addedCollider as unknown as Collider;
    expect(collider).not.toBeNull();
    expect(world.colliders).not.toContain(collider);
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

  it('fires a sensor event where the sensor is the higher-id collider', () => {
    const world = new PhysicsWorld();
    // Solid collider added first → lower id; sensor added second → higher id.
    const solid = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });
    const sensorBody = world.add(new PhysicsBody({ type: 'static', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(20, 20), isSensor: true }] }));
    const sensor = sensorBody.colliders[0]!;

    const enters: SensorEvent[] = [];
    world.onSensorEnter.add(e => enters.push(e));
    world.step(DT);

    expect(enters).toHaveLength(1);
    expect(enters[0].sensor).toBe(sensor);
    expect(enters[0].other).toBe(solid);
  });

  it('fires one sensor event (with the lower-id collider as sensor) when both overlapping colliders are sensors', () => {
    const world = new PhysicsWorld();
    const first = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 }, 0, 'static', { isSensor: true });
    const secondBody = world.add(new PhysicsBody({ type: 'static', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(20, 20), isSensor: true }] }));
    const second = secondBody.colliders[0]!;

    const enters: SensorEvent[] = [];
    world.onSensorEnter.add(e => enters.push(e));
    world.step(DT);

    expect(enters).toHaveLength(1);
    expect(enters[0].sensor).toBe(first); // added first → lower id → wins the tie-break
    expect(enters[0].other).toBe(second);
  });

  it('sorts sensorEnter events by (sensor.id, other.id), including a tie on the same sensor', () => {
    const world = new PhysicsWorld();
    // sensorA overlaps two different bodies (ties on sensor.id, so the sort must
    // fall through to comparing other.id) while a second, distinct sensor
    // overlaps a third body (differing sensor.id) — all entering on the first step.
    colliderAt(world, new BoxShape(40, 40), { x: 0, y: 0 }, 0, 'static', { isSensor: true });
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: -5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 }, 0, 'static', { isSensor: true });
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 100, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    const enters: SensorEvent[] = [];
    world.onSensorEnter.add(e => enters.push(e));
    world.step(DT);

    expect(enters.length).toBe(3);

    for (let i = 1; i < enters.length; i++) {
      const prev = enters[i - 1]!;
      const cur = enters[i]!;

      expect(prev.sensor.id < cur.sensor.id || (prev.sensor.id === cur.sensor.id && prev.other.id < cur.other.id)).toBe(true);
    }

    // Confirm a genuine tie on `sensor.id` occurred (the two bodies overlapping
    // the same big sensor), otherwise the loop above would pass trivially.
    expect(enters.some((e, i) => i > 0 && enters[i - 1]!.sensor.id === e.sensor.id)).toBe(true);
  });
});

describe('collision filter group override', () => {
  it('a positive shared group always collides, overriding an otherwise-blocking mask', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { group: 5, category: 0x0001, mask: 0x0000 } });
    world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10), filter: { group: 5, mask: 0x0000 } }] }),
    );

    const start = vi.fn();
    world.onCollisionStart.add(start);
    world.step(DT);

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a shared negative group never collides, overriding an otherwise-matching mask', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { group: -3 } });
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10), filter: { group: -3 } }] }));

    const start = vi.fn();
    world.onCollisionStart.add(start);
    world.step(DT);

    expect(start).not.toHaveBeenCalled();
  });

  it('different non-zero groups fall through to the normal category/mask check', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { group: 5 } });
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(10, 10), filter: { group: 7 } }] }));

    const start = vi.fn();
    world.onCollisionStart.add(start);
    world.step(DT);

    // Groups differ (no override) — default category/mask (0x0001 / 0xffff) still
    // matches, so it collides via the fallback path.
    expect(start).toHaveBeenCalledTimes(1);
  });
});
