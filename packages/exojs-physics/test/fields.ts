/**
 * Shared scene builder for the physics performance suites.
 *
 * The field is the scene both suites measure: independent box columns settled
 * on a static floor, so the steady state is persistent contacts plus the
 * broad-phase load of one AABB per body.
 */
import { BoxShape, PhysicsWorld } from '../src/index';
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

export const stepTimes = (world: PhysicsWorld, steps: number): number => {
  const start = performance.now();

  for (let i = 0; i < steps; i++) {
    world.step(FRAME);
  }

  return (performance.now() - start) / steps;
};
