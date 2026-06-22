import type { SceneNode } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, Collider, PhysicsBody, PhysicsWorld } from '../src/index';

interface FakeNode {
  skewX: number;
  skewY: number;
  x: number;
  y: number;
  rotation: number;
  setPosition(x: number, y: number): FakeNode;
  setRotation(degrees: number): FakeNode;
}

const fakeNode = (): FakeNode => ({
  skewX: 0,
  skewY: 0,
  x: 0,
  y: 0,
  rotation: 0,
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;

    return this;
  },
  setRotation(degrees: number) {
    this.rotation = degrees;

    return this;
  },
});

describe('PhysicsWorld lifecycle and mass model', () => {
  it('adds a freely-constructed static body carrying a collider', () => {
    const world = new PhysicsWorld();
    const collider = new Collider({ shape: new BoxShape(800, 32) });
    const ground = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 600 }, colliders: [collider] }));

    expect(ground.attached).toBe(true);
    expect(ground.type).toBe('static');
    expect(ground.x).toBe(0);
    expect(ground.y).toBe(600);
    expect(collider.body).toBe(ground);
    expect(collider.id).toBeGreaterThan(0);
    expect(world.bodies).toContain(ground);
    expect(world.colliders).toContain(collider);
  });

  it('constructs a body and colliders before the world assigns ids', () => {
    const collider = new Collider({ shape: new BoxShape(10, 10) });
    const body = new PhysicsBody({ type: 'dynamic', colliders: [collider] });

    // Unattached: no id, no body link, no mass model yet.
    expect(body.id).toBe(-1);
    expect(body.attached).toBe(false);
    expect(collider.id).toBe(-1);
    expect(body.isMassReady).toBe(false);

    const world = new PhysicsWorld();
    world.add(body);

    expect(body.id).toBeGreaterThan(0);
    expect(collider.id).toBeGreaterThan(0);
    expect(collider.body).toBe(body);
    expect(body.isMassReady).toBe(true);
    expect(body.mass).toBeCloseTo(100, 6);
  });

  it('rejects adding the same body twice', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10) }] }));

    expect(() => world.add(body)).toThrow();
  });

  it('derives mass and inertia for a dynamic body from collider density', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 } }));

    expect(body.isMassReady).toBe(false); // no collider yet

    body.addCollider({ shape: new BoxShape(10, 10), density: 2 });

    expect(body.isMassReady).toBe(true);
    expect(body.mass).toBeCloseTo(200, 6); // density 2 × area 100
    expect(body.invMass).toBeCloseTo(1 / 200, 9);
    expect(body.invInertia).toBeGreaterThan(0);
  });

  it('treats static and kinematic bodies as infinite mass', () => {
    const world = new PhysicsWorld();
    const staticBody = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10), density: 5 }] }));
    const kinematicBody = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10), density: 5 }] }),
    );

    expect(staticBody.invMass).toBe(0);
    expect(staticBody.invInertia).toBe(0);
    expect(staticBody.isMassReady).toBe(true);
    expect(kinematicBody.invMass).toBe(0);
  });

  it('fixedRotation removes angular response', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', fixedRotation: true, colliders: [{ shape: new BoxShape(10, 10), density: 1 }] }));

    expect(body.invMass).toBeGreaterThan(0);
    expect(body.invInertia).toBe(0);
  });

  it('destroyCollider detaches and recomputes mass', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic' }));
    const collider = body.addCollider({ shape: new BoxShape(10, 10), density: 1 });

    expect(body.mass).toBeCloseTo(100, 6);

    world.destroyCollider(collider);

    expect(world.colliders).not.toContain(collider);
    expect(collider.destroyed).toBe(true);
    expect(body.isMassReady).toBe(false);
  });

  it('throws when used after destroy', () => {
    const world = new PhysicsWorld();
    world.destroy();

    expect(() => world.add(new PhysicsBody())).toThrow();
    expect(() => world.step(1 / 60)).toThrow();
  });
});

describe('PhysicsWorld.attach convenience', () => {
  it('creates a body + collider and binds the node so it follows the body', () => {
    const world = new PhysicsWorld();
    const node = fakeNode();
    const body = world.attach(node as unknown as SceneNode, { type: 'kinematic', position: { x: 10, y: 20 }, shape: new CircleShape(16) });

    expect(body.attached).toBe(true);
    expect(body.type).toBe('kinematic');
    expect(body.colliders).toHaveLength(1);
    expect(body.colliders[0].shape).toBeInstanceOf(CircleShape);

    // Bound immediately on attach.
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);

    // Node tracks the body after a step.
    body.setTransform({ x: 55, y: 77 });
    world.step(1 / 60);
    expect(node.x).toBe(55);
    expect(node.y).toBe(77);
  });
});
