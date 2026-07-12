import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import { createRng } from '../../shared/rng';
import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsStructuralCounters } from '../PhysicsAdapter';

/** Side length of a dynamic box / diameter reference for a dynamic circle, px. */
const BODY_SIZE = 16;
/** Peak per-axis initial speed applied to a perturbed body, px/s. */
const PERTURB_SPEED = 400;

/**
 * Native `@codexo/exojs-physics` arm of the physics benchmark.
 *
 * Drives the real public API discovered from the package source: construct a
 * {@link PhysicsWorld} with gravity, add {@link PhysicsBody} instances carrying a
 * single collider (`BoxShape`/`CircleShape`) via `world.add`, and advance with
 * `world.step(dt)`. Structural counters read straight off the world
 * (`world.bodies.length`) and its detection backend
 * (`world.backend.contactGraph.solidContacts.length`).
 *
 * All scene randomness comes from the shared deterministic RNG so a scene is
 * byte-reproducible for a fixed seed, and the perturbed-body set is chosen
 * through the shared `selectMutationIndices` so a future matter/rapier arm
 * perturbs the identical bodies (asserted via {@link mutationSignature}).
 */
export const createExoJsPhysicsAdapter = (): PhysicsAdapter => {
  let world: PhysicsWorld | null = null;
  let perturbedSignature = mutationSignature([]);

  /** Build a static box collider body at a world position. */
  const staticBox = (x: number, y: number, width: number, height: number): PhysicsBody =>
    new PhysicsBody({ type: 'static', position: { x, y }, colliders: [{ shape: new BoxShape(width, height), friction: 0.5 }] });

  /**
   * `box-stack`: `columns` independent stacks of boxes settling on a wide static
   * floor. Resting-contact solving with warm-start + sleeping is the dominant
   * cost once settled.
   */
  const buildBoxStack = (w: PhysicsWorld, bodyCount: number, rng: () => number): void => {
    const rows = 8;
    const columns = Math.max(1, Math.ceil(bodyCount / rows));
    const spacing = BODY_SIZE + 6;
    const floorTop = 1_200;
    const width = columns * spacing + 200;

    w.add(staticBox(width / 2, floorTop + 20, width, 40));

    let placed = 0;

    for (let c = 0; c < columns && placed < bodyCount; c++) {
      const x = 100 + c * spacing;

      for (let r = 0; r < rows && placed < bodyCount; r++) {
        // Sub-pixel deterministic jitter so the lattice is not perfectly
        // degenerate (identical columns would under-exercise the broad phase).
        const jitter = (rng() - 0.5) * 0.5;

        w.add(
          new PhysicsBody({
            type: 'dynamic',
            position: { x: x + jitter, y: floorTop - BODY_SIZE / 2 - 1 - r * BODY_SIZE },
            colliders: [{ shape: new BoxShape(BODY_SIZE, BODY_SIZE), density: 1, friction: 0.5 }],
          }),
        );

        placed++;
      }
    }
  };

  /**
   * `many-dynamic`: a grid of small dynamic circles inside a bounded box (four
   * static walls), every body given a deterministic initial impulse. Wide
   * broad-phase load with many simultaneously-active bouncing contacts.
   */
  const buildManyDynamic = (w: PhysicsWorld, bodyCount: number, rng: () => number, perturbed: readonly number[]): void => {
    const radius = BODY_SIZE / 2;
    const cell = BODY_SIZE + 8;
    const columns = Math.ceil(Math.sqrt(bodyCount));
    const side = columns * cell + 80;
    const wall = 40;

    // Four static walls forming the bounded box.
    w.add(staticBox(side / 2, side + wall / 2, side + wall * 2, wall)); // floor
    w.add(staticBox(side / 2, -wall / 2, side + wall * 2, wall)); // ceiling
    w.add(staticBox(-wall / 2, side / 2, wall, side)); // left
    w.add(staticBox(side + wall / 2, side / 2, wall, side)); // right

    const perturbedSet = new Set(perturbed);

    for (let i = 0; i < bodyCount; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const body = w.add(
        new PhysicsBody({
          type: 'dynamic',
          position: { x: 40 + col * cell + radius, y: 40 + row * cell + radius },
          colliders: [{ shape: new CircleShape(radius), density: 1, friction: 0, restitution: 0.4 }],
        }),
      );

      if (perturbedSet.has(i)) {
        body.linearVelocityX = (rng() - 0.5) * 2 * PERTURB_SPEED;
        body.linearVelocityY = (rng() - 0.5) * 2 * PERTURB_SPEED;
      }
    }
  };

  /**
   * `mixed-static-dynamic`: a static floor plus a lattice of static box
   * obstacles, with dynamic boxes raining onto them from above. The common game
   * mix of an immovable level and many active bodies.
   */
  const buildMixed = (w: PhysicsWorld, bodyCount: number, rng: () => number): void => {
    const spacing = BODY_SIZE + 10;
    const columns = Math.max(1, Math.ceil(Math.sqrt(bodyCount)));
    const fieldWidth = columns * spacing + 200;
    const floorTop = 1_400;

    w.add(staticBox(fieldWidth / 2, floorTop + 20, fieldWidth, 40));

    // A few rows of static peg obstacles the dynamic bodies collide with on the
    // way down (staggered so bodies do not fall through clean gaps).
    const pegRows = 4;

    for (let pr = 0; pr < pegRows; pr++) {
      const y = 500 + pr * 200;
      const offset = pr % 2 === 0 ? 0 : spacing;

      for (let x = 120 + offset; x < fieldWidth - 120; x += spacing * 2) {
        w.add(staticBox(x, y, BODY_SIZE * 2, BODY_SIZE / 2));
      }
    }

    for (let i = 0; i < bodyCount; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const jitter = (rng() - 0.5) * 2;

      w.add(
        new PhysicsBody({
          type: 'dynamic',
          position: { x: 120 + col * spacing + jitter, y: 100 - row * spacing },
          colliders: [{ shape: new BoxShape(BODY_SIZE, BODY_SIZE), density: 1, friction: 0.3, restitution: 0.1 }],
        }),
      );
    }
  };

  return {
    engine: 'exojs-physics',
    config: 'native',

    setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void {
      const w = new PhysicsWorld({ gravity: spec.gravity });
      // Shared-RNG perturbed-body selection: the cross-arm determinism receipt.
      const perturbed = selectMutationIndices(bodyCount, spec.perturbFraction, seed);

      perturbedSignature = mutationSignature(perturbed);

      // Independent placement/velocity stream (same seed, separate instance):
      // deterministic across arms, distinct from the selection stream.
      const rng = createRng(seed ^ 0x5f35_6495);

      switch (spec.id) {
        case 'box-stack':
          buildBoxStack(w, bodyCount, rng);
          break;
        case 'many-dynamic':
          buildManyDynamic(w, bodyCount, rng, perturbed);
          break;
        case 'mixed-static-dynamic':
          buildMixed(w, bodyCount, rng);
          break;
      }

      world = w;
    },

    step(dt: number): void {
      if (world === null) {
        throw new Error('exojs-physics adapter: step() called before setup().');
      }

      world.step(dt);
    },

    sampleStructural(): PhysicsStructuralCounters {
      if (world === null) {
        throw new Error('exojs-physics adapter: sampleStructural() called before setup().');
      }

      return {
        bodyCount: world.bodies.length,
        contactCount: world.backend.contactGraph.solidContacts.length,
      };
    },

    teardown(): void {
      world?.destroy();
      world = null;
    },

    mutationSignature(): string {
      return perturbedSignature;
    },
  };
};
