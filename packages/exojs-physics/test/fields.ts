/**
 * Shared scene builder for the physics performance suites.
 *
 * The field is the scene both suites measure: independent box columns settled
 * on a static floor, so the steady state is persistent contacts plus the
 * broad-phase load of one AABB per body.
 */
import { BoxShape, PhysicsWorld, RevoluteJoint } from '../src/index';
import { PhysicsBody } from '../src/PhysicsBody';

export const FRAME = 1 / 60;

/** A wide field of `columns` independent `rows`-high box stacks on a static floor. */
export const buildField = (columns: number, rows: number, worldOptions: { enableSleeping?: boolean } = {}): { world: PhysicsWorld; bodies: PhysicsBody[] } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 }, ...worldOptions });
  const size = 16;
  const spacing = 20;
  const floorTop = 1000;
  const width = columns * spacing + 200;

  world.add(new PhysicsBody({ type: 'static', position: { x: width / 2, y: floorTop + 20 }, colliders: [{ shape: new BoxShape(width, 40), friction: 0.5 }] }));

  const bodies: PhysicsBody[] = [];

  for (let c = 0; c < columns; c++) {
    const x = 100 + c * spacing;

    for (let r = 0; r < rows; r++) {
      const body = world.add(
        new PhysicsBody({
          type: 'dynamic',
          position: { x, y: floorTop - size / 2 - 1 - r * size },
          colliders: [{ shape: new BoxShape(size, size), density: 1, friction: 0.5 }],
        }),
      );

      bodies.push(body);
    }
  }

  return { world, bodies };
};

/**
 * `chains` revolute chains of `links` boxes, each hanging from its own static
 * anchor, spaced so neighbouring chains never touch. Every link starts on the
 * seam below the one above it, so the chains hang at zero joint error and the
 * steady state is constraint bookkeeping with no contacts at all - the scene in
 * which per-joint and per-body per-step work is the whole cost.
 */
export const buildChains = (chains: number, links: number, worldOptions: { enableSleeping?: boolean } = {}): { world: PhysicsWorld; links: PhysicsBody[] } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 }, ...worldOptions });
  const size = 16;
  const spacing = size * 4;
  const anchorY = 200;
  const bodies: PhysicsBody[] = [];

  for (let chain = 0; chain < chains; chain++) {
    const x = 120 + chain * spacing;
    let previous = world.add(new PhysicsBody({ type: 'static', position: { x, y: anchorY }, colliders: [{ shape: new BoxShape(size, size), friction: 0.5 }] }));

    for (let link = 0; link < links; link++) {
      const y = anchorY + (link + 1) * size;
      const body = world.add(
        new PhysicsBody({ type: 'dynamic', position: { x, y }, colliders: [{ shape: new BoxShape(size, size), density: 1, friction: 0.5 }] }),
      );

      world.addJoint(new RevoluteJoint({ bodyA: previous, bodyB: body, anchor: { x, y: y - size / 2 }, collideConnected: false }));
      bodies.push(body);
      previous = body;
    }
  }

  return { world, links: bodies };
};

/** Step until every dynamic body sleeps, or until `limit` steps have passed; returns the steps taken. */
export const settle = (world: PhysicsWorld, limit: number): number => {
  for (let step = 0; step < limit; step++) {
    if (world.bodies.every(body => body.type !== 'dynamic' || body.isSleeping)) {
      return step;
    }

    world.step(FRAME);
  }

  return limit;
};

export const stepTimes = (world: PhysicsWorld, steps: number): number => {
  const start = performance.now();

  for (let i = 0; i < steps; i++) {
    world.step(FRAME);
  }

  return (performance.now() - start) / steps;
};
