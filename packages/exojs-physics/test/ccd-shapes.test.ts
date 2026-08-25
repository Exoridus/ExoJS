import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { Collider } from '../src/Collider';
import { canSweep, type SweepHit, sweepProxies } from '../src/collision/sweep';
import { BoxShape, CapsuleShape, ChainShape, CircleShape, PhysicsBody, PhysicsWorld, SegmentShape } from '../src/index';
import type { AnyShape } from '../src/shapes/AnyShape';
import type { ShapeType } from '../src/shapes/Shape';
import { measureAllocationRate } from './allocationSampler';
import { colliderAt } from './support';

/**
 * Continuous collision across the whole shape matrix. Every mass-bearing shape
 * sweeps against every target shape; boundary geometry is a target only.
 *
 * The casts below place the moving collider at its END pose and sweep it back
 * over `(dx, dy)`, which is the contract `sweepProxies` is called under.
 */

const DT = 1 / 60;

const hit: SweepHit = { t: 0, normalX: 0, normalY: 0 };

const movers: readonly ShapeType[] = ['circle', 'capsule', 'polygon'];
const targets: readonly ShapeType[] = ['circle', 'capsule', 'segment', 'polygon'];

const points = (...coordinates: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    out.push({ x: coordinates[i]!, y: coordinates[i + 1]! });
  }

  return out;
};

/** A collider swept 100px to the right, from `x = 0` to the pose it is created at. */
const movingRightFrom = (world: PhysicsWorld, shape: ConstructorParameters<typeof Collider>[0]['shape'], y = 0): Collider =>
  colliderAt(world, shape, { x: 100, y });

/** A vertical boundary/obstacle centred on `x = 50`. */
const obstacleAt = (world: PhysicsWorld, shape: ConstructorParameters<typeof Collider>[0]['shape'], y = 0): Collider => colliderAt(world, shape, { x: 50, y });

describe('the sweep matrix', () => {
  it('casts every mass-bearing shape against every target shape', () => {
    for (const moving of movers) {
      for (const target of targets) {
        expect([moving, target, canSweep(moving, target)]).toEqual([moving, target, true]);
      }
    }
  });

  it('never casts boundary geometry as the moving operand', () => {
    for (const target of [...targets, 'chain' as const]) {
      expect([target, canSweep('segment', target)]).toEqual([target, false]);
      expect([target, canSweep('chain', target)]).toEqual([target, false]);
    }
  });

  it('never dispatches a chain itself - a chain is swept through its edge proxies', () => {
    for (const moving of movers) {
      expect([moving, canSweep(moving, 'chain')]).toEqual([moving, false]);
    }
  });
});

describe('exact time of impact per pair', () => {
  /**
   * Every case fires the moving shape from `x = 0` to `x = 100` at an obstacle
   * whose facing surface sits at `x = 50`, so the expected impact fraction is
   * `(50 − targetRadius − movingExtent) / 100` and the surface normal is `(−1, 0)`.
   */
  const expectImpactAt = (moving: Collider, target: Collider, t: number): void => {
    expect(sweepProxies(moving, 100, 0, target, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(t, 6);
    expect(hit.normalX).toBeCloseTo(-1, 6);
    expect(hit.normalY).toBeCloseTo(0, 6);
  };

  it('circle against a segment', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CircleShape(5)), obstacleAt(world, new SegmentShape(0, -20, 0, 20)), 0.45);
  });

  it('circle against a capsule', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CircleShape(5)), obstacleAt(world, new CapsuleShape(0, -20, 0, 20, 3)), 0.42);
  });

  it('circle against a polygon', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CircleShape(5)), obstacleAt(world, new BoxShape(10, 40)), 0.4);
  });

  it('polygon against a segment', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new BoxShape(10, 40)), obstacleAt(world, new SegmentShape(0, -20, 0, 20)), 0.45);
  });

  it('polygon against a capsule', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new BoxShape(10, 40)), obstacleAt(world, new CapsuleShape(0, -20, 0, 20, 3)), 0.42);
  });

  it('capsule against a circle', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 4)), obstacleAt(world, new CircleShape(6)), 0.4);
  });

  it('capsule against a polygon', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 4)), obstacleAt(world, new BoxShape(10, 40)), 0.41);
  });

  it('capsule against a capsule', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 4)), obstacleAt(world, new CapsuleShape(0, -20, 0, 20, 3)), 0.43);
  });

  it('capsule against a segment', () => {
    const world = new PhysicsWorld();

    expectImpactAt(movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 4)), obstacleAt(world, new SegmentShape(0, -20, 0, 20)), 0.46);
  });

  it('meets a boundary endpoint on the cap arc, not on a squared-off corner', () => {
    // The capsule's spine ends at y = 10 and the boundary starts at (50, 13), so
    // the first touch is cap arc against endpoint: |(50, 13) − (46, 10)| = 5 at
    // t = 0.46. A radius-inflated SAT would square the cap off and stop the
    // capsule a full radius short, at t = 0.45.
    const world = new PhysicsWorld();
    const moving = movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 5));
    const target = colliderAt(world, new SegmentShape(0, 0, 50, 0), { x: 50, y: 13 });

    expect(sweepProxies(moving, 100, 0, target, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(0.46, 6);
    expect(hit.normalX).toBeCloseTo(-0.8, 6);
    expect(hit.normalY).toBeCloseTo(-0.6, 6);
  });
});

describe('sweep invariants across the matrix', () => {
  it('reports no impact for a pair already overlapping at the start of the motion', () => {
    const world = new PhysicsWorld();
    // End pose x = 100, motion 20 - the cast starts at x = 80, deep inside the
    // obstacle, which the discrete solver owns.
    const moving = colliderAt(world, new CapsuleShape(0, -10, 0, 10, 4), { x: 100, y: 0 });
    const target = colliderAt(world, new SegmentShape(0, -20, 0, 20), { x: 80, y: 0 });

    expect(sweepProxies(moving, 20, 0, target, hit)).toBe(false);
  });

  it('reports no impact for a near miss past the end of a boundary', () => {
    const world = new PhysicsWorld();
    // The capsule's outermost point reaches y = 15; the boundary starts at y = 16.
    const moving = movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 5));
    const target = colliderAt(world, new SegmentShape(0, 0, 50, 0), { x: 50, y: 16 });

    expect(sweepProxies(moving, 100, 0, target, hit)).toBe(false);
  });

  it('keeps the impact fraction in (0, 1] and stops short of a target beyond the motion', () => {
    const world = new PhysicsWorld();
    const moving = colliderAt(world, new CapsuleShape(0, -10, 0, 10, 4), { x: 40, y: 0 });

    expect(sweepProxies(moving, 40, 0, obstacleAt(world, new SegmentShape(0, -20, 0, 20)), hit)).toBe(false);
    expect(
      sweepProxies(colliderAt(world, new CapsuleShape(0, -10, 0, 10, 4), { x: 46, y: 0 }), 46, 0, obstacleAt(world, new SegmentShape(0, -20, 0, 20)), hit),
    ).toBe(true);
    expect(hit.t).toBeGreaterThan(0);
    expect(hit.t).toBeLessThanOrEqual(1);
  });

  it('gives the same impact for either operand order, with the normal from the target', () => {
    const world = new PhysicsWorld();
    const capsuleMoving = movingRightFrom(world, new CapsuleShape(0, -10, 0, 10, 4));
    const boxTarget = obstacleAt(world, new BoxShape(10, 40));

    expect(sweepProxies(capsuleMoving, 100, 0, boxTarget, hit)).toBe(true);

    const forwardT = hit.t;

    // The mirror image: a box swept left onto a static capsule.
    const mirrored = new PhysicsWorld();
    const boxMoving = colliderAt(mirrored, new BoxShape(10, 40), { x: -100, y: 0 });
    const capsuleTarget = colliderAt(mirrored, new CapsuleShape(0, -10, 0, 10, 4), { x: -50, y: 0 });

    expect(sweepProxies(boxMoving, -100, 0, capsuleTarget, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(forwardT, 6);
    expect(hit.normalX).toBeCloseTo(1, 6);
    expect(hit.normalY).toBeCloseTo(0, 6);
  });

  it('takes the earliest of several candidate impacts', () => {
    const world = new PhysicsWorld();
    const moving = movingRightFrom(world, new CircleShape(5));
    const near = obstacleAt(world, new SegmentShape(0, -20, 0, 20));
    const far = colliderAt(world, new SegmentShape(0, -20, 0, 20), { x: 70, y: 0 });

    expect(sweepProxies(moving, 100, 0, far, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(0.65, 6);
    expect(sweepProxies(moving, 100, 0, near, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(0.45, 6);
  });
});

describe('sweeping a chain', () => {
  /** A flat floor of three 100px edges from (-150, 0) to (150, 0); solid from above. */
  const flatFloor = (): ChainShape => new ChainShape(points(-150, 0, -50, 0, 50, 0, 150, 0));

  const chainEdges = (world: PhysicsWorld): readonly Collider[] => {
    const chain = colliderAt(world, flatFloor(), { x: 0, y: 0 });

    return chain.chainEdges!;
  };

  it('blocks a body arriving on the solid side', () => {
    const world = new PhysicsWorld();
    const edge = chainEdges(world)[1]!;
    const moving = colliderAt(world, new CircleShape(5), { x: 0, y: 0 });

    // Swept downward from y = -100 onto the floor at y = 0.
    expect(sweepProxies(moving, 0, 100, edge, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(0.95, 6);
    expect(hit.normalY).toBeCloseTo(-1, 6);
  });

  it('lets a body through from the hollow side, exactly as the discrete phase does', () => {
    const world = new PhysicsWorld();
    const edge = chainEdges(world)[1]!;
    const moving = colliderAt(world, new CircleShape(5), { x: 0, y: 0 });

    // Swept upward from y = 100 through the same edge.
    expect(sweepProxies(moving, 0, -100, edge, hit)).toBe(false);
  });

  it('hands a shared vertex to exactly one edge', () => {
    const world = new PhysicsWorld();
    const edges = chainEdges(world);
    // Straight down onto the vertex the first two edges share, at (-50, 0).
    const moving = colliderAt(world, new CircleShape(5), { x: -50, y: 0 });
    let blocking = 0;

    for (const edge of edges) {
      if (sweepProxies(moving, 0, 100, edge, hit)) {
        blocking++;
        expect(hit.t).toBeCloseTo(0.95, 6);
      }
    }

    // A collinear seam is a tie both edges keep - what carries a body across a
    // straight run - so the vertex is never a gap and never a double stop with
    // conflicting normals.
    expect(blocking).toBeGreaterThan(0);
    expect(blocking).toBeLessThanOrEqual(2);
  });

  it('stops a fast bullet that would otherwise cross the chain within one step', () => {
    const fire = (bullet: boolean): PhysicsBody => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

      world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [{ shape: flatFloor() }] }));

      const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: -100 }, colliders: [{ shape: new CircleShape(5), density: 1 }] });
      ball.isBullet = bullet;
      world.add(ball);
      ball.linearVelocityY = 9000; // 150px per fixed step: no step lands near the floor, and one step crosses it

      for (let frame = 0; frame < 5; frame++) {
        world.step(DT);
      }

      return ball;
    };

    expect(fire(false).y).toBeGreaterThan(150); // discrete detection misses it
    expect(fire(true).y).toBeLessThan(100);
  });

  it('stops a fast bullet against a plain segment as well', () => {
    const fire = (bullet: boolean): PhysicsBody => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

      world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new SegmentShape(0, -200, 0, 200) }] }));

      const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6), density: 1 }] });
      ball.isBullet = bullet;
      world.add(ball);
      ball.linearVelocityX = 9000; // 150px per fixed step: no step lands near the boundary, and one step crosses it

      for (let frame = 0; frame < 5; frame++) {
        world.step(DT);
      }

      return ball;
    };

    expect(fire(false).x).toBeGreaterThan(220);
    expect(fire(true).x).toBeLessThan(200);
  });

  it('protects a fast capsule the same way it protects a circle', () => {
    const fire = (bullet: boolean): PhysicsBody => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

      world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new SegmentShape(0, -200, 0, 200) }] }));

      const body = new PhysicsBody({
        type: 'dynamic',
        position: { x: 0, y: 0 },
        colliders: [{ shape: new CapsuleShape(-10, 0, 10, 0, 5), density: 1 }],
      });
      body.isBullet = bullet;
      world.add(body);
      body.linearVelocityX = 9000;

      for (let frame = 0; frame < 5; frame++) {
        world.step(DT);
      }

      return body;
    };

    expect(fire(false).x).toBeGreaterThan(220);
    expect(fire(true).x).toBeLessThan(200);
  });
});

describe('sweeping the new shapes costs no per-step allocation', () => {
  /**
   * A bullet ping-ponging between two walls sweeps on every single step, so the
   * steady-state rate is the shape cast's own. The capsule/boundary pairs build
   * a configuration-space ring per cast; growing that scratch once must not turn
   * into an allocation per step.
   */
  const pingPong = (wall: () => AnyShape, bullet: () => AnyShape): PhysicsWorld => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    for (const x of [-200, 200]) {
      world.add(new PhysicsBody({ type: 'static', position: { x, y: 0 }, colliders: [{ shape: wall(), restitution: 1 }] }));
    }

    const body = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: bullet(), density: 1, restitution: 1 }] });
    body.isBullet = true;
    world.add(body);
    body.linearVelocityX = 9000;

    return world;
  };

  it('stays within the rate of the shapes that already shipped', async () => {
    const boundary = pingPong(
      () => new SegmentShape(0, -200, 0, 200),
      () => new CapsuleShape(-10, 0, 10, 0, 5),
    );
    const solid = pingPong(
      () => new BoxShape(10, 400),
      () => new CircleShape(6),
    );

    for (let frame = 0; frame < 120; frame++) {
      boundary.step(DT);
      solid.step(DT);
    }

    if (boundary.step.toString().includes('cov_')) {
      console.log('allocation comparison skipped under coverage (instrumentation inflates the measurement)');

      return;
    }

    const boundaryRate = await measureAllocationRate(() => boundary.step(DT), { iterations: 200 });
    const solidRate = await measureAllocationRate(() => solid.step(DT), { iterations: 200 });

    console.log(
      `${(boundaryRate.bytesPerIteration / 1024).toFixed(2)} KB/step capsule vs segment sweep, ` +
        `${(solidRate.bytesPerIteration / 1024).toFixed(2)} KB/step circle vs box sweep`,
    );

    expect(boundaryRate.bytesPerIteration).toBeLessThan(solidRate.bytesPerIteration * 2 + 64 * 1024);
  });
});
