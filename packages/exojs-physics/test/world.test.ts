import { Container, Drawable, type SceneNode } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { createAabb, expandAabb } from '../src/Aabb';
import { BoxShape, CircleShape, Collider, DistanceJoint, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

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

  it('destroying an already-destroyed collider a second time is a safe no-op', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic' }));
    const collider = body.addCollider({ shape: new BoxShape(10, 10), density: 1 });

    world.destroyCollider(collider);
    // Second destroy: the collider is already spliced out of body._colliders, so
    // PhysicsBody._removeCollider's indexOf must return -1 (already-removed guard).
    expect(() => world.destroyCollider(collider)).not.toThrow();
  });

  it('throws when used after destroy', () => {
    const world = new PhysicsWorld();
    world.destroy();

    expect(() => world.add(new PhysicsBody())).toThrow();
    expect(() => world.step(1 / 60)).toThrow();
  });

  it('destroy marks every contained body destroyed and is idempotent', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10) }] }));

    world.destroy();

    expect(body.destroyed).toBe(true);
    expect(world.bodies).toHaveLength(0);

    // Calling destroy again is a no-op guard, not a second teardown.
    expect(() => world.destroy()).not.toThrow();
  });

  it('rejects an invalid subStepCount (non-integer or below 1)', () => {
    expect(() => new PhysicsWorld({ subStepCount: 2.5 })).toThrow(RangeError);
    expect(() => new PhysicsWorld({ subStepCount: 0 })).toThrow(RangeError);
    expect(() => new PhysicsWorld({ subStepCount: -1 })).toThrow(RangeError);
  });

  it('destroying a body that was never added tears it down without crashing', () => {
    const world = new PhysicsWorld();
    const body = new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10) }] });

    // Never passed to world.add() — destroyBody must still find and tear it down
    // (the "created and destroyed within the same dispatch" case documented on
    // PhysicsWorld._removeBody).
    world.destroyBody(body);

    expect(body.destroyed).toBe(true);
    expect(() => body.addCollider({ shape: new BoxShape(5, 5) })).toThrow();
    expect(() => body.setTransform({ x: 1, y: 1 })).toThrow();
    // body.attached is still false (it never joined a world), so world.add lets it
    // through the "already attached" guard and hits the destroyed guard instead.
    expect(() => world.add(body)).toThrow();
  });
});

describe('PhysicsWorld joints and backend accessors', () => {
  it('exposes added/removed joints via the joints getter and steps a static-anchored joint', () => {
    const world = new PhysicsWorld();
    const anchor = world.add(new PhysicsBody({ type: 'static' }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 50 }, colliders: [{ shape: new CircleShape(5) }] }));
    const joint = world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 50 }));

    expect(world.joints).toContain(joint);

    // A static anchor never joins the dynamic-island union (bodyA.type !== 'dynamic').
    expect(() => world.step(1 / 60)).not.toThrow();

    world.removeJoint(joint);
    expect(world.joints).not.toContain(joint);
  });

  it('addJoint is idempotent when the same joint instance is added twice', () => {
    const world = new PhysicsWorld();
    const anchor = world.add(new PhysicsBody({ type: 'static' }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 50 }, colliders: [{ shape: new CircleShape(5) }] }));
    const joint = new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 50 });

    world.addJoint(joint);
    world.addJoint(joint); // second add is a no-op guard (already tracked)

    expect(world.joints.filter(j => j === joint)).toHaveLength(1);
  });

  it('removeJoint on a joint that was never added is a safe no-op', () => {
    const world = new PhysicsWorld();
    const anchor = world.add(new PhysicsBody({ type: 'static' }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 50 }, colliders: [{ shape: new CircleShape(5) }] }));
    const joint = new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 50 });

    expect(() => world.removeJoint(joint)).not.toThrow();
    expect(world.joints).not.toContain(joint);
  });

  it('steps a jointed pair of dynamic bodies, coupling them into one sleep island', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // `bodyB` is added first (the lower island index) but passed as the joint's
    // *second* body — deliberately reversed from index order, so the island
    // union-find takes its `rootB < rootA` branch, not just `rootA < rootB`.
    const dynB = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 20, y: 0 }, colliders: [{ shape: new CircleShape(5), density: 1 }] }));
    const dynA = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(5), density: 1 }] }));
    const joint = world.addJoint(new DistanceJoint({ bodyA: dynA, bodyB: dynB, length: 20 }));

    expect(() => world.step(1 / 60)).not.toThrow();
    expect(world.joints).toContain(joint);

    // A disabled joint is still tracked but skipped by the island-coupling check.
    joint.enabled = false;
    expect(() => world.step(1 / 60)).not.toThrow();
  });

  it('unioning an already-merged pair a second time (contact + joint on the same pair) is a no-op', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // The two circles overlap (distance 8 < the sum of their radii, 10), so the
    // same pair is unioned twice in one pass: once via the solid contact (which
    // merges them first), once via the joint. The second call finds both
    // already at the same union-find root — neither `_union` branch fires.
    const dynB = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 8, y: 0 }, colliders: [{ shape: new CircleShape(5), density: 1 }] }));
    const dynA = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(5), density: 1 }] }));
    const joint = world.addJoint(new DistanceJoint({ bodyA: dynA, bodyB: dynB, length: 8 }));

    expect(() => world.step(1 / 60)).not.toThrow();
    expect(world.joints).toContain(joint);
  });

  it('exposes the detection backend and its contact graph', () => {
    const world = new PhysicsWorld();

    expect(world.backend).toBeDefined();
    expect(world.backend.contactGraph.recordCount).toBe(0);
  });

  it('sorts persistent solid contacts by (a.id, b.id), including ties on a.id, and removeCollider drops only the matching record', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    // The floor is added first (lowest id) and both boxes rest on it without
    // touching each other — two solid contacts share the same `a` (the floor),
    // so the sort comparator must fall through to comparing `b.id`.
    colliderAt(world, new BoxShape(400, 20), { x: 0, y: 100 });
    const boxLeft = world.add(new PhysicsBody({ type: 'dynamic', position: { x: -50, y: 100 - 10 - 5 }, colliders: [{ shape: new BoxShape(16, 16) }] }));
    world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 100 - 10 - 5 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    for (let i = 0; i < 30; i++) {
      world.step(1 / 60);
    }

    const contacts = world.backend.contactGraph.solidContacts;

    expect(contacts.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < contacts.length; i++) {
      const prev = contacts[i - 1]!;
      const cur = contacts[i]!;

      expect(prev.a.id < cur.a.id || (prev.a.id === cur.a.id && prev.b.id < cur.b.id)).toBe(true);
    }

    // Confirm a genuine tie on `a.id` occurred (otherwise the assertion above
    // would pass trivially without ever exercising the tie-break branch).
    expect(contacts.some((c, i) => i > 0 && contacts[i - 1]!.a.id === c.a.id)).toBe(true);

    // Destroying one box's collider must drop only its own record, leaving the
    // other box's still-touching floor contact intact (ContactGraph.removeCollider
    // skips records that reference neither the destroyed collider's side).
    world.destroyCollider(boxLeft.colliders[0]!);
    expect(world.backend.contactGraph.recordCount).toBeGreaterThanOrEqual(1);
  });

  it('accepts an explicit fixedDelta and maxSubSteps, forwarding both to the time stepper', () => {
    const world = new PhysicsWorld({ fixedDelta: 1 / 30, maxSubSteps: 2 });

    expect(world.timeStepper.fixedDelta).toBeCloseTo(1 / 30, 9);
  });

  it('a frame delta smaller than fixedDelta accumulates without running any fixed step', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10), density: 1 }] }));

    world.step(1 / 100_000); // far smaller than the default fixedDelta (1/60)

    expect(body.y).toBe(0); // no fixed step ran yet — nothing integrated
  });
});

describe('Aabb helpers', () => {
  it('createAabb returns a zero-extent box at the origin', () => {
    expect(createAabb()).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('expandAabb grows every side by margin, mutating and returning the same object', () => {
    const box = { minX: 10, minY: 20, maxX: 30, maxY: 40 };
    const result = expandAabb(box, 5);

    expect(result).toBe(box);
    expect(box).toEqual({ minX: 5, minY: 15, maxX: 35, maxY: 45 });
  });

  it('expandAabb with a negative margin shrinks the box', () => {
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

    expandAabb(box, -2);

    expect(box).toEqual({ minX: 2, minY: 2, maxX: 8, maxY: 8 });
  });
});

describe('Collider validation and accessors', () => {
  it('rejects a negative or non-finite density', () => {
    expect(() => new Collider({ shape: new BoxShape(10, 10), density: -1 })).toThrow(RangeError);
    expect(() => new Collider({ shape: new BoxShape(10, 10), density: Number.NaN })).toThrow(RangeError);
  });

  it('throws reading .body before the collider is attached to a body in a world', () => {
    const collider = new Collider({ shape: new BoxShape(10, 10) });

    expect(() => collider.body).toThrow();
  });

  it('exposes the world transform after synchronize', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'static', position: { x: 5, y: 7 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const collider = body.colliders[0]!;

    expect(collider.worldTransform.x).toBe(5);
    expect(collider.worldTransform.y).toBe(7);
  });
});

describe('PhysicsBody accessors, force/torque/impulse and mass edge cases', () => {
  it('exposes position as a fresh Vector and body-local centre-of-mass accessors', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 3, y: 4 }, colliders: [{ shape: new BoxShape(10, 10), density: 1 }] }));

    expect(body.position.x).toBe(3);
    expect(body.position.y).toBe(4);
    // A centred, symmetric box puts the centre of mass at the body origin.
    expect(body.centerOfMassX).toBeCloseTo(0, 6);
    expect(body.centerOfMassY).toBeCloseTo(0, 6);
  });

  it('synchronizeColliders refreshes every collider from the current transform', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'static', position: { x: 12, y: 34 }, colliders: [{ shape: new CircleShape(5) }] }));
    const collider = body.colliders[0]!;

    body.synchronizeColliders();

    expect(collider.worldCenter.x).toBe(12);
    expect(collider.worldCenter.y).toBe(34);
  });

  it('applyForce accumulates a world-space force integrated on the next step', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10), density: 1 }] }));

    expect(body.applyForce(1000, 0)).toBe(body);

    world.step(1 / 60);
    expect(body.linearVelocityX).toBeGreaterThan(0);
  });

  it('applyTorque accumulates a torque integrated on the next step', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10), density: 1 }] }));

    expect(body.applyTorque(500)).toBe(body);

    world.step(1 / 60);
    expect(body.angularVelocity).not.toBe(0);
  });

  it('applyImpulse is a no-op on a static (infinite-mass) body', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'static', colliders: [{ shape: new BoxShape(10, 10) }] }));

    expect(body.applyImpulse(1000, 1000)).toBe(body);
    expect(body.linearVelocityX).toBe(0);
    expect(body.linearVelocityY).toBe(0);
  });

  it('addCollider accepts a pre-built Collider instance on a not-yet-attached body', () => {
    const body = new PhysicsBody({ type: 'dynamic' });
    const collider = new Collider({ shape: new BoxShape(10, 10), density: 1 });

    const returned = body.addCollider(collider);

    expect(returned).toBe(collider);
    expect(body.colliders).toContain(collider);
    expect(collider.id).toBe(-1); // no owner yet — no id allocation happens
  });

  it('ignores zero-density colliders when aggregating mass but still counts a positive-density one', () => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({
        type: 'dynamic',
        colliders: [
          { shape: new BoxShape(10, 10), density: 0 },
          { shape: new BoxShape(10, 10), density: 2 },
        ],
      }),
    );

    expect(body.mass).toBeCloseTo(200, 6); // only the density-2 collider contributes
    expect(body.isMassReady).toBe(true);
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

  it('creates a body with only the required shape option (every other field defaults)', () => {
    const world = new PhysicsWorld();
    const node = fakeNode();
    const body = world.attach(node as unknown as SceneNode, { shape: new CircleShape(5) });

    expect(body.type).toBe('dynamic'); // BodyOptions default
    expect(body.gravityScale).toBe(1);
    expect(body.fixedRotation).toBe(false);
    expect(body.colliders[0]!.density).toBe(1); // Collider default
    expect(body.colliders[0]!.isSensor).toBe(false);
  });

  it('creates a body with every optional field specified', () => {
    const world = new PhysicsWorld();
    const node = fakeNode();
    const body = world.attach(node as unknown as SceneNode, {
      type: 'dynamic',
      position: { x: 1, y: 2 },
      angle: 0.5,
      gravityScale: 2,
      fixedRotation: true,
      shape: new BoxShape(10, 10),
      offset: { x: 1, y: 1 },
      rotation: 0.1,
      density: 3,
      friction: 0.4,
      restitution: 0.6,
      isSensor: true,
      filter: { category: 0x0002, mask: 0x0002, group: 0 },
    });

    expect(body.type).toBe('dynamic');
    expect(body.gravityScale).toBe(2);
    expect(body.fixedRotation).toBe(true);

    const collider = body.colliders[0]!;

    expect(collider.offsetX).toBe(1);
    expect(collider.offsetY).toBe(1);
    expect(collider.localRotation).toBeCloseTo(0.1, 9);
    expect(collider.density).toBe(3);
    expect(collider.friction).toBeCloseTo(0.4, 9);
    expect(collider.restitution).toBeCloseTo(0.6, 9);
    expect(collider.isSensor).toBe(true);
    expect(collider.filter.category).toBe(0x0002);
  });
});

describe('PhysicsWorld.attach: defaults to the node\'s world position (P2f)', () => {
  it('places the body at the node\'s current world position when no position option is given', () => {
    const world = new PhysicsWorld();
    const node = new Drawable();

    node.setPosition(100, 50);

    const body = world.attach(node, { shape: new CircleShape(5) });

    expect(body.x).toBe(100);
    expect(body.y).toBe(50);

    node.destroy();
  });

  it('respects an explicit position option over the node\'s world position', () => {
    const world = new PhysicsWorld();
    const node = new Drawable();

    node.setPosition(100, 50);

    const body = world.attach(node, { position: { x: 5, y: 9 }, shape: new CircleShape(5) });

    expect(body.x).toBe(5);
    expect(body.y).toBe(9);

    node.destroy();
  });

  it('uses the WORLD position (not the local position) for a node nested under a transformed parent', () => {
    const world = new PhysicsWorld();
    const parent = new Container();
    const node = new Drawable();

    parent.setPosition(90, 40);
    node.setPosition(10, 10);
    parent.addChild(node);

    const body = world.attach(node, { shape: new CircleShape(5) });

    expect(body.x).toBe(100);
    expect(body.y).toBe(50);

    parent.destroy();
  });

  it('defaults the body angle to the node\'s current world rotation when no angle option is given', () => {
    const world = new PhysicsWorld();
    const node = new Drawable();

    node.setRotation(90); // degrees

    const body = world.attach(node, { shape: new CircleShape(5) });

    expect(body.angle).toBeCloseTo(Math.PI / 2, 6);

    node.destroy();
  });

  it('respects an explicit angle option over the node\'s world rotation', () => {
    const world = new PhysicsWorld();
    const node = new Drawable();

    node.setRotation(90);

    const body = world.attach(node, { angle: 0, shape: new CircleShape(5) });

    expect(body.angle).toBe(0);

    node.destroy();
  });

  it('composes WORLD rotation through a rotated parent (not just the node\'s own local rotation)', () => {
    const world = new PhysicsWorld();
    const parent = new Container();
    const node = new Drawable();

    parent.setRotation(30);
    node.setRotation(15);
    parent.addChild(node);

    const body = world.attach(node, { shape: new CircleShape(5) });

    expect(body.angle).toBeCloseTo((45 * Math.PI) / 180, 6);

    parent.destroy();
  });

  it('falls back to (0, 0) for a duck-typed node without getWorldTransform', () => {
    const world = new PhysicsWorld();
    const node = fakeNode();

    node.setPosition(123, 456); // ignored: no getWorldTransform to read from

    const body = world.attach(node as unknown as SceneNode, { shape: new CircleShape(5) });

    expect(body.x).toBe(0);
    expect(body.y).toBe(0);
  });
});
