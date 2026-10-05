import { Container } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { CollisionEvent } from '../src/index';
import { BoxShape, ChainShape, CircleShape, DistanceJoint, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const DT = 1 / 60;
const GRAVITY = 1000;

const advance = (world: PhysicsWorld, seconds: number): void => {
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
    world.step(DT);
  }
};

const kinematicBox = (x: number, y: number): PhysicsBody =>
  new PhysicsBody({ type: 'kinematic', position: { x, y }, colliders: [{ shape: new BoxShape(10, 10) }] });

describe('PhysicsWorld.remove', () => {
  it('takes the body out of the world but keeps it alive with its state', () => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 10, y: 20 },
        angle: 0.5,
        gravityScale: 0.25,
        colliders: [{ shape: new CircleShape(5), friction: 0.7 }],
      }),
    );
    const collider = body.colliders[0]!;
    const mass = body.mass;

    body.linearVelocityX = 30;
    body.linearVelocityY = -40;
    body.angularVelocity = 2;
    world.remove(body);

    expect(body.attached).toBe(false);
    expect(body.destroyed).toBe(false);
    expect(body.id).toBe(-1);
    expect(collider.id).toBe(-1);
    expect(collider.destroyed).toBe(false);
    expect(collider.body).toBe(body);
    expect([body.x, body.y, body.angle]).toEqual([10, 20, 0.5]);
    expect([body.linearVelocityX, body.linearVelocityY, body.angularVelocity]).toEqual([30, -40, 2]);
    expect(body.mass).toBe(mass);
    expect(body.gravityScale).toBe(0.25);
    expect(collider.friction).toBe(0.7);
    expect(world.bodies).not.toContain(body);
    expect(world.colliders).not.toContain(collider);
    expect(world.queryPoint({ x: 10, y: 20 })).toEqual([]);
  });

  it('re-adds into the same world with new ids', () => {
    const world = new PhysicsWorld();

    world.add(kinematicBox(100, 100));

    const body = world.add(kinematicBox(0, 0));
    const collider = body.colliders[0]!;

    world.remove(body);
    world.add(body);

    expect(body.attached).toBe(true);
    expect(body.id).toBeGreaterThanOrEqual(0);
    expect(collider.id).toBeGreaterThanOrEqual(0);
    expect(world.bodies).toContain(body);
    expect(world.queryPoint({ x: 0, y: 0 })).toEqual([collider]);
  });

  it('can join another world after leaving one', () => {
    const first = new PhysicsWorld();
    const second = new PhysicsWorld();
    const body = first.add(kinematicBox(0, 0));

    first.remove(body);
    second.add(body);

    expect(first.bodies).not.toContain(body);
    expect(second.bodies).toContain(body);
    expect(second.queryPoint({ x: 0, y: 0 })).toEqual([body.colliders[0]]);
  });

  it('ends its touching pairs before a re-added pair starts again', () => {
    const world = new PhysicsWorld();

    colliderAt(world, new BoxShape(100, 10), { x: 0, y: 0 });

    const box = world.add(kinematicBox(0, -8));
    const order: string[] = [];

    world.onCollisionStart.add(() => order.push('start'));
    world.onCollisionEnd.add(() => order.push('end'));
    world.step(DT);
    order.length = 0;

    world.remove(box);
    world.add(box);
    world.step(DT);

    expect(order).toEqual(['end', 'start']);
  });

  it('wakes bodies resting on it, and a re-added sleeper wakes and falls', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const platform = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 320 }, colliders: [{ shape: new BoxShape(1200, 40) }] }));
    const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 282 }, colliders: [{ shape: new BoxShape(32, 32) }] }));

    advance(world, 2);
    expect(box.isSleeping).toBe(true);

    world.remove(platform);
    expect(box.isSleeping).toBe(false);

    // Put the support straight back so the box can settle and sleep again.
    world.add(platform);
    advance(world, 2);
    expect(box.isSleeping).toBe(true);

    // Remove the sleeper, take its support away while it is out, put it back.
    world.remove(box);
    world.destroyBody(platform);
    world.add(box);
    expect(box.isSleeping).toBe(false);

    const restingY = box.y;

    advance(world, 0.25);
    expect(box.y).toBeGreaterThan(restingY + 10);
  });

  it('stops writing a bound node', () => {
    const world = new PhysicsWorld();
    const node = new Container();
    const body = world.add(kinematicBox(5, 5));

    world.bind(body, node);
    world.remove(body);
    body.setTransform({ x: 99, y: 0 });
    world.step(DT);

    expect(node.x).toBe(5);
  });

  it('re-adds a chain body with fresh edge ids that collide again', () => {
    const world = new PhysicsWorld();
    const ground = world.add(
      new PhysicsBody({
        type: 'static',
        colliders: [
          {
            shape: new ChainShape([
              { x: -100, y: 0 },
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ]),
          },
        ],
      }),
    );
    const chain = ground.colliders[0]!;
    const starts: CollisionEvent[] = [];

    world.onCollisionStart.add(event => starts.push(event));
    world.remove(ground);
    expect(chain.chainEdges!.every(edge => edge.id === -1)).toBe(true);

    world.add(ground);
    expect(chain.chainEdges!.every(edge => edge.id >= 0)).toBe(true);

    world.add(kinematicBox(-50, -4));
    world.step(DT);
    expect(starts).toHaveLength(1);
  });

  it('rejects a body that does not belong to this world', () => {
    const world = new PhysicsWorld();
    const other = new PhysicsWorld();
    const foreign = other.add(kinematicBox(0, 0));
    const removed = world.add(kinematicBox(0, 0));

    world.remove(removed);

    expect(() => world.remove(new PhysicsBody())).toThrow(/does not belong to this world/);
    expect(() => world.remove(removed)).toThrow(/does not belong to this world/);
    expect(() => world.remove(foreign)).toThrow(/does not belong to this world/);
  });

  it('rejects a destroyed body and a destroyed world', () => {
    const world = new PhysicsWorld();
    const body = world.add(kinematicBox(0, 0));
    const survivor = world.add(kinematicBox(50, 0));

    world.destroyBody(body);
    expect(() => world.remove(body)).toThrow(/destroyed body/);

    world.destroy();
    expect(() => world.remove(survivor)).toThrow(/world has been destroyed/);
  });

  it('rejects a body constrained by a joint', () => {
    const world = new PhysicsWorld();
    const a = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new CircleShape(5) }] }));
    const b = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 30, y: 0 }, colliders: [{ shape: new CircleShape(5) }] }));
    const joint = world.addJoint(new DistanceJoint({ bodyA: a, bodyB: b }));

    expect(() => world.remove(a)).toThrow(/constrained by a joint/);

    world.removeJoint(joint);
    expect(() => world.remove(a)).not.toThrow();
  });

  it('lets destroyBody end a removed body', () => {
    const world = new PhysicsWorld();
    const body = world.add(kinematicBox(0, 0));

    world.remove(body);
    world.destroyBody(body);

    expect(body.destroyed).toBe(true);
    expect(body.colliders[0]!.destroyed).toBe(true);
  });
});
