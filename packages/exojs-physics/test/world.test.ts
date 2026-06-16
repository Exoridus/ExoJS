import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsWorld } from '../src/index';

describe('PhysicsWorld lifecycle and mass model', () => {
  it('createStaticCollider yields an addressable static body', () => {
    const world = new PhysicsWorld();
    const ground = world.createStaticCollider({ shape: new BoxShape(800, 32), position: { x: 0, y: 600 } });

    expect(ground.body.type).toBe('static');
    expect(ground.body.x).toBe(0);
    expect(ground.body.y).toBe(600);
    expect(world.colliders).toContain(ground);
  });

  it('derives mass and inertia for a dynamic body from collider density', () => {
    const world = new PhysicsWorld();
    const body = world.createBody({ type: 'dynamic', position: { x: 0, y: 0 } });

    expect(body.isMassReady).toBe(false); // no collider yet

    body.createCollider({ shape: new BoxShape(10, 10), density: 2 });

    expect(body.isMassReady).toBe(true);
    expect(body.mass).toBeCloseTo(200, 6); // density 2 × area 100
    expect(body.invMass).toBeCloseTo(1 / 200, 9);
    expect(body.invInertia).toBeGreaterThan(0);
  });

  it('treats static and kinematic bodies as infinite mass', () => {
    const world = new PhysicsWorld();
    const staticBody = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
    const kinematicBody = world.createBody({ type: 'kinematic', position: { x: 0, y: 0 } });
    staticBody.createCollider({ shape: new BoxShape(10, 10), density: 5 });
    kinematicBody.createCollider({ shape: new BoxShape(10, 10), density: 5 });

    expect(staticBody.invMass).toBe(0);
    expect(staticBody.invInertia).toBe(0);
    expect(staticBody.isMassReady).toBe(true);
    expect(kinematicBody.invMass).toBe(0);
  });

  it('fixedRotation removes angular response', () => {
    const world = new PhysicsWorld();
    const body = world.createBody({ type: 'dynamic', fixedRotation: true });
    body.createCollider({ shape: new BoxShape(10, 10), density: 1 });

    expect(body.invMass).toBeGreaterThan(0);
    expect(body.invInertia).toBe(0);
  });

  it('destroyCollider detaches and recomputes mass', () => {
    const world = new PhysicsWorld();
    const body = world.createBody({ type: 'dynamic' });
    const collider = body.createCollider({ shape: new BoxShape(10, 10), density: 1 });

    expect(body.mass).toBeCloseTo(100, 6);

    world.destroyCollider(collider);

    expect(world.colliders).not.toContain(collider);
    expect(collider.destroyed).toBe(true);
    expect(body.isMassReady).toBe(false);
  });

  it('throws when used after destroy', () => {
    const world = new PhysicsWorld();
    world.destroy();

    expect(() => world.createBody()).toThrow();
    expect(() => world.step(1 / 60)).toThrow();
  });
});
