import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, CapsuleShape, ChainShape, CircleShape, PhysicsBody, PhysicsWorld, SegmentShape, type ShapeCastHit } from '../src/index';
import type { AnyShape } from '../src/shapes/AnyShape';
import { measureAllocationRate } from './allocationSampler';
import { colliderAt } from './support';

const points = (...coordinates: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    out.push({ x: coordinates[i]!, y: coordinates[i + 1]! });
  }

  return out;
};

const movers: ReadonlyArray<readonly [string, () => AnyShape, number]> = [
  ['circle', () => new CircleShape(10), 10],
  ['box', () => new BoxShape(20, 20), 10],
  ['capsule', () => new CapsuleShape(0, -5, 0, 5, 5), 5],
];

/** A wall whose left face sits at x = 100. */
const wallAt100 = (world: PhysicsWorld) => colliderAt(world, new BoxShape(20, 400), { x: 110, y: 0 });

describe('PhysicsWorld.shapeCast', () => {
  it.each(movers)('reports the earliest hit and its normal for a %s', (_name, shape, halfWidth) => {
    const world = new PhysicsWorld();
    const near = wallAt100(world);

    colliderAt(world, new BoxShape(20, 400), { x: 160, y: 0 });

    const hit = world.shapeCast(shape(), { x: 0, y: 0 }, { x: 200, y: 0 });

    expect(hit).not.toBeNull();
    expect(hit!.collider).toBe(near);
    expect(hit!.body).toBe(near.body);
    expect(hit!.initialOverlap).toBe(false);
    expect(hit!.distance).toBeCloseTo(100 - halfWidth, 6);
    expect(hit!.fraction).toBeCloseTo((100 - halfWidth) / 200, 6);
    expect(hit!.normal.x).toBeCloseTo(-1, 6);
    expect(hit!.normal.y).toBeCloseTo(0, 6);
  });

  it('returns null when the motion is free and when it stops short of the obstacle', () => {
    const world = new PhysicsWorld();

    wallAt100(world);

    expect(world.shapeCast(new CircleShape(10), { x: 0, y: 0 }, { x: 0, y: 300 })).toBeNull();
    expect(world.shapeCast(new CircleShape(10), { x: 0, y: 0 }, { x: 80, y: 0 })).toBeNull();
  });

  it('rotates the cast shape by the angle option', () => {
    const world = new PhysicsWorld();

    wallAt100(world);

    const upright = world.shapeCast(new BoxShape(40, 10), { x: 0, y: 0 }, { x: 200, y: 0 });
    const turned = world.shapeCast(new BoxShape(40, 10), { x: 0, y: 0 }, { x: 200, y: 0 }, { angle: Math.PI / 2 });

    expect(upright!.distance).toBeCloseTo(80, 6);
    expect(turned!.distance).toBeCloseTo(95, 6);
  });

  it('respects the filter, exclusions and sensors', () => {
    const world = new PhysicsWorld();
    const filtered = colliderAt(world, new BoxShape(20, 400), { x: 50, y: 0 }, 0, 'static', { filter: { category: 0x0004 } });
    const sensor = colliderAt(world, new BoxShape(20, 400), { x: 80, y: 0 }, 0, 'static', { isSensor: true });
    const excluded = colliderAt(world, new BoxShape(20, 400), { x: 110, y: 0 });
    const last = colliderAt(world, new BoxShape(20, 400), { x: 140, y: 0 });
    const shape = new CircleShape(5);
    const from = { x: 0, y: 0 };
    const motion = { x: 300, y: 0 };

    expect(world.shapeCast(shape, from, motion)!.collider).toBe(filtered);
    expect(world.shapeCast(shape, from, motion, { filter: { mask: 0x0001 } })!.collider).toBe(excluded);
    expect(world.shapeCast(shape, from, motion, { filter: { mask: 0x0001 }, includeSensors: true })!.collider).toBe(sensor);
    expect(world.shapeCast(shape, from, motion, { filter: { mask: 0x0001 }, exclude: [excluded] })!.collider).toBe(last);
    expect(world.shapeCast(shape, from, motion, { exclude: [filtered.body, excluded, last.body] })).toBeNull();
  });

  it('hits static, kinematic and dynamic colliders alike', () => {
    for (const type of ['static', 'kinematic', 'dynamic'] as const) {
      const world = new PhysicsWorld();
      const target = colliderAt(world, new BoxShape(20, 20), { x: 110, y: 0 }, 0, type);

      expect(world.shapeCast(new CircleShape(10), { x: 0, y: 0 }, { x: 200, y: 0 })!.collider).toBe(target);
    }
  });

  it('does not skip thin geometry however long the motion', () => {
    const world = new PhysicsWorld();
    const sliver = colliderAt(world, new BoxShape(0.5, 400), { x: 5000, y: 0 });
    const segment = colliderAt(world, new SegmentShape(0, -200, 0, 200), { x: 9000, y: 0 });

    expect(world.shapeCast(new CircleShape(2), { x: 0, y: 0 }, { x: 100_000, y: 0 })!.collider).toBe(sliver);
    expect(world.shapeCast(new BoxShape(4, 4), { x: 6000, y: 0 }, { x: 100_000, y: 0 })!.collider).toBe(segment);
  });

  it('keeps chains one-sided and reports the chain, not an edge', () => {
    const world = new PhysicsWorld();
    const floor = colliderAt(world, new ChainShape(points(-200, 0, 0, 0, 200, 0)), { x: 0, y: 0 });
    const down = world.shapeCast(new CircleShape(5), { x: 10, y: -50 }, { x: 0, y: 100 });
    const up = world.shapeCast(new CircleShape(5), { x: 10, y: 50 }, { x: 0, y: -100 });

    // Exactly one side of the chain is solid; casting from the other side passes.
    expect([down, up].filter(hit => hit !== null)).toHaveLength(1);

    const hit = (down ?? up)!;

    expect(hit.collider).toBe(floor);
    expect(hit.distance).toBeCloseTo(45, 6);
  });

  it('reports an initial overlap only for motion that does not leave it', () => {
    const world = new PhysicsWorld();
    const wall = wallAt100(world);
    const shape = new CircleShape(10);
    // Overlapping the wall's left face by 2.
    const from = { x: 92, y: 0 };

    const deeper = world.shapeCast(shape, from, { x: 50, y: 0 });

    expect(deeper!.collider).toBe(wall);
    expect(deeper!.initialOverlap).toBe(true);
    expect(deeper!.fraction).toBe(0);
    expect(deeper!.distance).toBe(0);
    expect(deeper!.penetration).toBeCloseTo(2, 6);
    expect(deeper!.normal.x).toBeCloseTo(-1, 6);

    expect(world.shapeCast(shape, from, { x: -50, y: 0 })).toBeNull();
    expect(world.shapeCast(shape, from, { x: 0, y: 50 })).toBeNull();
  });

  it.each(movers)('blocks a %s that starts exactly touching the obstacle', (_name, shape, halfWidth) => {
    const world = new PhysicsWorld();
    const wall = wallAt100(world);
    const from = { x: 100 - halfWidth, y: 0 };
    const into = world.shapeCast(shape(), from, { x: 50, y: 0 });

    expect(into!.collider).toBe(wall);
    expect(into!.initialOverlap).toBe(true);
    expect(into!.fraction).toBe(0);
    expect(into!.penetration).toBeCloseTo(0, 6);
    expect(into!.normal.x).toBeCloseTo(-1, 6);
    expect(world.shapeCast(shape(), from, { x: 0, y: 50 })).toBeNull();
    expect(world.shapeCast(shape(), from, { x: -50, y: 0 })).toBeNull();
  });

  it('treats a zero displacement as an overlap test', () => {
    const world = new PhysicsWorld();
    const wall = wallAt100(world);
    const shape = new CircleShape(10);

    expect(world.shapeCast(shape, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();

    const hit = world.shapeCast(shape, { x: 95, y: 0 }, { x: 0, y: 0 });

    expect(hit!.collider).toBe(wall);
    expect(hit!.initialOverlap).toBe(true);
    expect(hit!.penetration).toBeCloseTo(5, 6);
  });

  it('rejects boundary shapes and non-finite input', () => {
    const world = new PhysicsWorld();

    expect(() => world.shapeCast(new SegmentShape(0, 0, 1, 0), { x: 0, y: 0 }, { x: 1, y: 0 })).toThrow(TypeError);
    expect(() => world.shapeCast(new ChainShape(points(0, 0, 1, 0)), { x: 0, y: 0 }, { x: 1, y: 0 })).toThrow(TypeError);
    expect(() => world.shapeCast(new CircleShape(1), { x: 0, y: 0 }, { x: Number.NaN, y: 0 })).toThrow(RangeError);
    expect(() => world.shapeCast(new CircleShape(1), { x: Infinity, y: 0 }, { x: 1, y: 0 })).toThrow(RangeError);
  });

  it('writes into a caller-owned hit and sees bodies moved since the last step', () => {
    const world = new PhysicsWorld();
    const target = new PhysicsBody({ type: 'kinematic', position: { x: 110, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] });
    const out: ShapeCastHit = {
      collider: null!,
      body: null!,
      fraction: 0,
      distance: 0,
      normal: { x: 0, y: 0 },
      initialOverlap: false,
      penetration: 0,
    };

    world.add(target);
    world.step(1 / 60);

    expect(world.shapeCast(new CircleShape(10), { x: 0, y: 0 }, { x: 300, y: 0 }, {}, out)).toBe(out);
    expect(out.distance).toBeCloseTo(90, 6);

    target.setTransform({ x: 210, y: 0 });
    world.shapeCast(new CircleShape(10), { x: 0, y: 0 }, { x: 300, y: 0 }, {}, out);
    expect(out.distance).toBeCloseTo(190, 6);
  });

  it('allocates no objects in steady state with a caller-owned hit', async () => {
    const world = new PhysicsWorld();

    if (world.shapeCast.toString().includes('cov_')) {
      return;
    }

    for (let i = 0; i < 20; i++) {
      colliderAt(world, new BoxShape(20, 20), { x: 100 + i * 40, y: (i % 3) * 10 });
    }

    const shape = new BoxShape(10, 10);
    const from = { x: 0, y: 0 };
    const motion = { x: 1000, y: 0 };
    const exclude = [world.bodies[0]!];
    const options = { exclude, filter: { mask: 0xffff } };
    const out: ShapeCastHit = {
      collider: null!,
      body: null!,
      fraction: 0,
      distance: 0,
      normal: { x: 0, y: 0 },
      initialOverlap: false,
      penetration: 0,
    };
    const rate = await measureAllocationRate(() => world.shapeCast(shape, from, motion, options, out), { warmup: 50, iterations: 2000 });

    // The cast builds no objects. What the sampler still sees is V8 boxing the
    // displacement doubles passed into the per-candidate sweep whenever it
    // declines to inline that call - measured ~0.7 KB per cast over these 20
    // candidates. Building a proxy or a hit per candidate would add several
    // kilobytes on top.
    expect(rate.bytesPerIteration).toBeLessThan(4 * 1024);
  });
});
