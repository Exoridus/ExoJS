import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { Collider } from '../src/Collider';
import type { CollisionEvent, SensorEvent } from '../src/events';
import { BoxShape, ChainShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';
import { measureAllocationRate } from './allocationSampler';

/**
 * Chains: connected boundary geometry. One authored collider, one solver contact
 * per touched edge, and a single pair of begin/end events for the whole chain.
 */

const DT = 1 / 60;

const points = (...coordinates: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    out.push({ x: coordinates[i]!, y: coordinates[i + 1]! });
  }

  return out;
};

/**
 * A flat floor of three 100px chain edges from (-150, 0) to (150, 0). Left to
 * right, so the outward normals point up and the chain is solid from above.
 */
const flatFloor = (): ChainShape => new ChainShape(points(-150, 0, -50, 0, 50, 0, 150, 0));

const settle = (world: PhysicsWorld, steps: number): void => {
  for (let i = 0; i < steps; i++) {
    world.step(DT);
  }
};

describe('ChainShape', () => {
  it('is boundary geometry with one edge per vertex pair', () => {
    const chain = new ChainShape(points(0, 0, 10, 0, 20, 0));

    expect(chain.type).toBe('chain');
    expect(chain.massProperties).toBeNull();
    expect(chain.count).toBe(3);
    expect(chain.edgeCount).toBe(2);
    expect(chain.closed).toBe(false);
    expect(chain.boundingRadius).toBeCloseTo(20);
    expect(Object.isFrozen(chain)).toBe(true);
  });

  it('closes the loop with one extra edge', () => {
    const loop = new ChainShape(points(0, 0, 10, 0, 10, 10), { closed: true });

    expect(loop.edgeCount).toBe(3);
  });

  it('welds coincident vertices and drops a repeated closing vertex', () => {
    const welded = new ChainShape(points(0, 0, 0, 0, 10, 0));
    const loop = new ChainShape(points(0, 0, 10, 0, 10, 10, 0, 0), { closed: true });

    expect(welded.count).toBe(2);
    expect(loop.count).toBe(3);
    expect(loop.edgeCount).toBe(3);
  });

  it('keeps collinear vertices, unlike a polygon', () => {
    const chain = new ChainShape(points(0, 0, 10, 0, 20, 0, 30, 0));

    expect(chain.count).toBe(4);
    expect(chain.edgeCount).toBe(3);
  });

  it('rejects under-specified and non-finite input', () => {
    expect(() => new ChainShape(points(0, 0))).toThrow(RangeError);
    expect(() => new ChainShape(points(0, 0, 0, 0))).toThrow(RangeError);
    expect(() => new ChainShape(points(0, 0, 10, 0), { closed: true })).toThrow(RangeError);
    expect(() => new ChainShape([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }])).toThrow(RangeError);
  });
});

describe('a chain collider fans out into engine-owned edge proxies', () => {
  it('keeps the authored collider as the only public one', () => {
    const world = new PhysicsWorld();
    const collider = new Collider({ shape: flatFloor() });
    const body = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [collider] }));

    world.step(DT);

    expect(body.colliders).toHaveLength(1);
    expect(world.colliders).toEqual([collider]);
    expect(collider.chainEdges).toHaveLength(3);
  });

  it('spans the whole chain with its AABB and moves with a kinematic body', () => {
    const world = new PhysicsWorld();
    const collider = new Collider({ shape: flatFloor() });
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [collider] }));

    expect(collider.aabb.minX).toBeCloseTo(-150);
    expect(collider.aabb.maxX).toBeCloseTo(150);

    body.setTransform({ x: 100, y: 25 }, 0);

    expect(collider.aabb.minX).toBeCloseTo(-50);
    expect(collider.aabb.maxX).toBeCloseTo(250);
    expect(collider.aabb.minY).toBeCloseTo(25);
  });

  it('refuses to carry a dynamic body on its own', () => {
    const world = new PhysicsWorld();
    const body = new PhysicsBody({ type: 'dynamic', colliders: [{ shape: flatFloor() }] });

    expect(() => world.add(body)).toThrow(/at least one collider with mass/);
  });
});

describe('chain collision', () => {
  it('supports a box across several edges', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [{ shape: flatFloor() }] }));

    const box = world.add(
      new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 40 }, colliders: [{ shape: new BoxShape(120, 20), density: 1 }] }),
    );

    settle(world, 120);

    expect(box.y).toBeCloseTo(90, 0);
    expect(Math.abs(box.linearVelocityY)).toBeLessThan(1);
  });

  it('is solid on one side only', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    // Reversed winding: the outward normals point down, so the chain is solid
    // from below and a body falling onto it passes straight through.
    world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 0, y: 100 },
        colliders: [{ shape: new ChainShape(points(150, 0, 50, 0, -50, 0, -150, 0)) }],
      }),
    );

    const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 40 }, colliders: [{ shape: new BoxShape(20, 20), density: 1 }] }));

    settle(world, 120);

    expect(box.y).toBeGreaterThan(200);
  });

  it('carries a body across a shared vertex without snagging', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [{ shape: flatFloor() }] }));

    const box = world.add(
      new PhysicsBody({ type: 'dynamic', position: { x: -120, y: 88 }, colliders: [{ shape: new BoxShape(20, 20), density: 1, friction: 0 }] }),
    );

    settle(world, 30);

    box.linearVelocityX = 600;

    let maxUpwards = 0;

    // Crosses both interior vertices. A seam contact carrying the wrong normal
    // shows up as an upward kick the moment the box passes over one.
    for (let i = 0; i < 30; i++) {
      world.step(DT);
      maxUpwards = Math.max(maxUpwards, -box.linearVelocityY);
    }

    expect(box.x).toBeGreaterThan(0);
    expect(maxUpwards).toBeLessThan(20);
  });

  it('lets a body rest in a concave corner, where both walls keep their contact', () => {
    const world = new PhysicsWorld({ gravity: { x: -200, y: 1000 } });

    // A wall coming down, then a floor running right: solid above the floor and
    // to the right of the wall, which is the inside of the corner.
    world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 0, y: 0 },
        colliders: [{ shape: new ChainShape(points(-100, -100, -100, 0, 100, 0)) }],
      }),
    );

    const box = world.add(
      new PhysicsBody({ type: 'dynamic', position: { x: -60, y: -40 }, colliders: [{ shape: new BoxShape(20, 20), density: 1 }] }),
    );

    settle(world, 180);

    expect(box.y).toBeCloseTo(-10, 0);
    expect(box.x).toBeCloseTo(-90, 0);
  });

  it('does not collide with another chain', () => {
    const world = new PhysicsWorld();
    let started = 0;

    world.onCollisionStart.add(() => {
      started++;
    });
    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [{ shape: flatFloor() }] }));
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new ChainShape(points(0, -50, 0, 50)) }] }));

    settle(world, 5);

    expect(started).toBe(0);
  });
});

describe('chain events use the authored collider', () => {
  it('fires one begin and one end however many edges are touched', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const chain = new Collider({ shape: flatFloor() });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [chain] }));

    const box = world.add(
      new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 40 }, colliders: [{ shape: new BoxShape(120, 20), density: 1 }] }),
    );

    const started: CollisionEvent[] = [];
    const ended: CollisionEvent[] = [];

    world.onCollisionStart.add((event) => started.push(event));
    world.onCollisionEnd.add((event) => ended.push(event));

    settle(world, 120);

    expect(started).toHaveLength(1);
    expect(started[0]!.colliderA === chain || started[0]!.colliderB === chain).toBe(true);
    expect(started[0]!.colliderA.chainParent).toBeNull();
    expect(started[0]!.colliderB.chainParent).toBeNull();
    expect(ended).toHaveLength(0);

    // Lift the box clear of every edge at once.
    box.setTransform({ x: 0, y: -500 }, 0);
    settle(world, 2);

    expect(ended).toHaveLength(1);
    expect(started).toHaveLength(1);
  });

  it('aggregates sensor enter/exit the same way', () => {
    const world = new PhysicsWorld();
    const chain = new Collider({ shape: flatFloor(), isSensor: true });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [chain] }));

    const box = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(120, 20) }] }),
    );

    const entered: SensorEvent[] = [];
    const exited: SensorEvent[] = [];

    world.onSensorEnter.add((event) => entered.push(event));
    world.onSensorExit.add((event) => exited.push(event));

    settle(world, 2);

    expect(entered).toHaveLength(1);
    expect(entered[0]!.sensor).toBe(chain);

    box.setTransform({ x: 0, y: -500 }, 0);
    settle(world, 2);

    expect(exited).toHaveLength(1);
    expect(exited[0]!.sensor).toBe(chain);
  });

  it('applies the chain collider material and filter to every edge', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const chain = new Collider({ shape: flatFloor(), filter: { category: 0x0002, mask: 0x0002 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [chain] }));

    const box = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 0, y: 40 },
        colliders: [{ shape: new BoxShape(20, 20), density: 1, filter: { category: 0x0001, mask: 0x0001 } }],
      }),
    );

    settle(world, 60);

    // Filtered out by the chain's own filter, which the edge proxies carry none of.
    expect(box.y).toBeGreaterThan(200);
  });

  it('reaches the contact modifier once per edge, always with the authored pair', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const chain = new Collider({ shape: flatFloor() });
    let calls = 0;

    world.contactModifier = (contact) => {
      calls++;
      expect(contact.colliderA === chain || contact.colliderB === chain).toBe(true);
    };

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [chain] }));
    world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 40 }, colliders: [{ shape: new BoxShape(120, 20), density: 1 }] }));

    settle(world, 120);

    expect(calls).toBeGreaterThan(1);
  });
});

describe('chain queries report the chain, never a proxy', () => {
  const world = new PhysicsWorld();
  const chain = new Collider({ shape: flatFloor() });

  world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [chain] }));
  world.step(DT);

  it('answers no point query, having no interior', () => {
    expect(world.queryPoint({ x: 0, y: 0 })).toEqual([]);
  });

  it('reports the chain once for an AABB overlapping several edges', () => {
    const bounds = { minX: -200, minY: -10, maxX: 200, maxY: 10 };

    expect(world.queryAabb(bounds)).toEqual([chain]);

    const seen: Collider[] = [];

    world.forEachAabbHit(bounds, undefined, (hit) => seen.push(hit));

    expect(seen).toEqual([chain]);
  });

  it('reports the chain once for a shape overlap across several edges', () => {
    expect(world.overlapShape(new BoxShape(200, 20), { x: 0, y: 0 })).toEqual([chain]);
  });

  it('finds a body with a chain query shape', () => {
    const other = new PhysicsWorld();
    const box = new Collider({ shape: new BoxShape(20, 20) });

    other.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [box] }));
    other.step(DT);

    expect(other.overlapShape(flatFloor(), { x: 0, y: 0 })).toEqual([box]);
  });

  it('returns the chain from a ray cast', () => {
    const hit = world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 });

    expect(hit?.collider).toBe(chain);
    expect(hit?.point.y).toBeCloseTo(0);
    expect(hit?.normal.y).toBeCloseTo(-1);
  });
});

describe('chain lifecycle', () => {
  it('drops every edge proxy when the collider is destroyed', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const chain = new Collider({ shape: flatFloor() });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [chain] }));

    const box = world.add(
      new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 40 }, colliders: [{ shape: new BoxShape(120, 20), density: 1 }] }),
    );

    settle(world, 120);
    expect(box.y).toBeCloseTo(90, 0);

    world.destroyCollider(chain);
    settle(world, 60);

    expect(chain.destroyed).toBe(true);
    expect(world.queryAabb({ minX: -200, minY: -200, maxX: 200, maxY: 200 })).not.toContain(chain);
    expect(box.y).toBeGreaterThan(150);
  });
});

describe('chain performance', () => {
  it('adds no per-step allocation over the equivalent solid floor', async () => {
    const build = (floor: () => ChainShape | BoxShape, floorY: number): PhysicsWorld => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

      world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: floorY }, colliders: [{ shape: floor() }] }));

      for (let i = 0; i < 20; i++) {
        world.add(
          new PhysicsBody({
            type: 'dynamic',
            position: { x: -140 + i * 14, y: 40 },
            colliders: [{ shape: new CircleShape(6), density: 1, friction: 0.4 }],
          }),
        );
      }

      return world;
    };

    const chainWorld = build(flatFloor, 100);
    const boxWorld = build(() => new BoxShape(300, 20), 110);

    settle(chainWorld, 240);
    settle(boxWorld, 240);

    if (chainWorld.step.toString().includes('cov_')) {
      console.log('allocation comparison skipped under coverage (instrumentation inflates the measurement)');

      return;
    }

    const chainRate = await measureAllocationRate(() => chainWorld.step(DT), { iterations: 200 });
    const boxRate = await measureAllocationRate(() => boxWorld.step(DT), { iterations: 200 });

    console.log(
      `${(chainRate.bytesPerIteration / 1024).toFixed(2)} KB/step chain floor vs ${(boxRate.bytesPerIteration / 1024).toFixed(2)} KB/step box floor`,
    );

    // A chain that rebuilt its edge geometry per step would allocate a multiple
    // of the solid floor's rate; sharing the proxies keeps the two comparable.
    expect(chainRate.bytesPerIteration).toBeLessThan(boxRate.bytesPerIteration * 2 + 64 * 1024);
  });
});
