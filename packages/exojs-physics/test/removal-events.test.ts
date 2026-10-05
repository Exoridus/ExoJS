import { describe, expect, it } from 'vitest';

import type { CollisionEvent, SensorEvent } from '../src/index';
import { BoxShape, ChainShape, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const DT = 1 / 60;

/** A static floor and a kinematic box overlapping it, stepped once so the contact has begun. */
const touchingPair = (sensor = false) => {
  const world = new PhysicsWorld();
  const floor = colliderAt(world, new BoxShape(100, 10), { x: 0, y: 0 }, 0, 'static', { isSensor: sensor });
  const box = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: -8 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
  const ends: CollisionEvent[] = [];
  const exits: SensorEvent[] = [];
  const order: string[] = [];

  world.onCollisionEnd.add(event => {
    ends.push(event);
    order.push('end');
  });
  world.onSensorExit.add(event => {
    exits.push(event);
    order.push('exit');
  });
  world.onCollisionStart.add(() => order.push('start'));
  world.onSensorEnter.add(() => order.push('enter'));

  world.step(DT);
  expect(order).toEqual([sensor ? 'enter' : 'start']);
  order.length = 0;

  return { world, floor, box, ends, exits, order };
};

describe('end events when a collider leaves the world', () => {
  it('destroyBody ends a solid contact exactly once, on the next step', () => {
    const { world, floor, box, ends } = touchingPair();

    world.destroyBody(box);
    expect(ends).toHaveLength(0);

    world.step(DT);
    expect(ends).toHaveLength(1);
    expect([ends[0]!.colliderA, ends[0]!.colliderB]).toContain(floor);

    world.step(DT);
    expect(ends).toHaveLength(1);
  });

  it('destroyBody ends a sensor overlap exactly once', () => {
    const { world, box, ends, exits } = touchingPair(true);

    world.destroyBody(box);
    world.step(DT);

    expect(exits).toHaveLength(1);
    expect(ends).toHaveLength(0);
  });

  it('destroyCollider ends a solid contact and a sensor overlap exactly once', () => {
    const solid = touchingPair();

    solid.world.destroyCollider(solid.box.colliders[0]!);
    solid.world.step(DT);
    expect(solid.ends).toHaveLength(1);

    const sensor = touchingPair(true);

    sensor.world.destroyCollider(sensor.floor);
    sensor.world.step(DT);
    expect(sensor.exits).toHaveLength(1);
  });

  it('ends a contact spanning several chain edges with one event', () => {
    const world = new PhysicsWorld();
    const chain = new ChainShape([
      { x: -150, y: 0 },
      { x: -50, y: 0 },
      { x: 50, y: 0 },
      { x: 150, y: 0 },
    ]);

    world.add(new PhysicsBody({ type: 'static', colliders: [{ shape: chain }] }));

    // Straddles the vertex at x = -50, so it touches two edge proxies.
    const box = world.add(new PhysicsBody({ type: 'kinematic', position: { x: -50, y: -4 }, colliders: [{ shape: new BoxShape(20, 10) }] }));
    const starts: CollisionEvent[] = [];
    const ends: CollisionEvent[] = [];

    world.onCollisionStart.add(event => starts.push(event));
    world.onCollisionEnd.add(event => ends.push(event));
    world.step(DT);
    expect(starts).toHaveLength(1);

    world.destroyBody(box);
    world.step(DT);
    expect(ends).toHaveLength(1);
  });

  it('dispatches removal ends ahead of the events the next step produces', () => {
    const { world, box, order } = touchingPair();

    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 30, y: -8 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    world.destroyBody(box);
    world.step(DT);

    expect(order).toEqual(['end', 'start']);
  });

  it('delivers the end of a removal made inside a callback with the following dispatch', () => {
    const world = new PhysicsWorld();

    colliderAt(world, new BoxShape(100, 10), { x: 0, y: 0 });

    const box = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: -8 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const ends: CollisionEvent[] = [];

    world.onCollisionStart.add(() => world.destroyBody(box));
    world.onCollisionEnd.add(event => ends.push(event));

    world.step(DT);
    expect(box.destroyed).toBe(true);
    expect(ends).toHaveLength(0);

    world.step(DT);
    expect(ends).toHaveLength(1);
  });

  it('sorts the ends of one removal by collider ids', () => {
    const world = new PhysicsWorld();

    colliderAt(world, new BoxShape(100, 10), { x: 0, y: 0 });

    const body = world.add(
      new PhysicsBody({
        type: 'kinematic',
        position: { x: 0, y: -8 },
        colliders: [
          { shape: new BoxShape(10, 10), offset: { x: 20, y: 0 } },
          { shape: new BoxShape(10, 10), offset: { x: -20, y: 0 } },
        ],
      }),
    );
    const ends: CollisionEvent[] = [];

    world.step(DT);
    world.onCollisionEnd.add(event => ends.push(event));
    world.destroyBody(body);
    world.step(DT);

    const pairs = ends.map(event => [event.colliderA.id, event.colliderB.id]);
    const sorted = [...pairs].sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);

    expect(pairs).toHaveLength(2);
    expect(pairs).toEqual(sorted);
  });

  it('drops pending removal ends when the world is destroyed', () => {
    const { world, box, ends } = touchingPair();

    world.destroyBody(box);

    expect(() => world.destroy()).not.toThrow();
    expect(ends).toHaveLength(0);
  });
});
