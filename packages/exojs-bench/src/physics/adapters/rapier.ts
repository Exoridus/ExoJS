import type * as RAPIER from '@dimforge/rapier2d-compat';

import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsStructuralCounters } from '../PhysicsAdapter';
import { describePhysicsScene } from './scene';

/**
 * rapier (`@dimforge/rapier2d-compat`) arm of the physics benchmark — the
 * "attach a Rust/WASM physics engine" comparison against staying on native
 * `@codexo/exojs-physics`.
 *
 * FAIRNESS (see `scene.ts` and the driver's disclosed caveats): the scene is
 * built from the shared {@link describePhysicsScene} descriptor, so rapier
 * simulates the byte-identical body configuration (counts, positions, shapes,
 * sizes, static/dynamic split, perturbed-body set) the exojs and matter arms do,
 * and the perturbed selection is asserted cross-arm through
 * {@link PhysicsAdapter.mutationSignature}.
 *
 * UNIT MAPPING (rapier is SI-consistent, so the mapping is trivial compared to
 * matter): gravity is an acceleration vector in world-units/s², the timestep is
 * in seconds, and linear velocity is world-units/s. Feeding the px-scale
 * archetype values directly makes 1 world-unit = 1 px, so gravity (px/s²),
 * `world.timestep = 1/60 s`, and the px/s perturbation impulses all carry over
 * unchanged. rapier's convention is unit-agnostic on the Y axis, so this arm
 * keeps exojs's +Y-DOWN frame (positive gravity Y = down): identical numeric
 * positions to the other two arms.
 *
 * DISCLOSED NON-EQUIVALENCE (each engine measured at its own sensible default):
 * - Solver iterations: rapier's TGS-Soft defaults (4 solver iterations, 1
 *   internal PGS iteration) differ from exojs's 4-substep TGS-Soft and matter's
 *   6/4/2 constraint iterations.
 * - Sleeping: rapier auto-deactivates resting bodies by default (like exojs;
 *   unlike matter's default).
 * - Length unit: rapier's internal tolerances (allowed penetration, prediction
 *   distance) are tuned for ~1-unit-sized objects; this arm feeds it a px-scale
 *   world at the default `lengthUnit = 1` (i.e. 16 px boxes, ~1000 px/s²
 *   gravity), which is exactly what a user attaching rapier with pixel
 *   coordinates gets. Kept at the default and disclosed rather than silently
 *   retuned.
 * - Contact count is the number of collider pairs whose narrow-phase manifold has
 *   at least one solid contact point (`numContacts() > 0`), deduped — a
 *   touching-pair count directly comparable to exojs's solid-contact count. It is
 *   gathered once after the timed window, so its O(pairs) cost never taints a
 *   step timing.
 *
 * The library bundles its WASM and requires an async `RAPIER.init()` before any
 * world is built; both the dynamic `import()` and `init()` happen once in
 * {@link createRapierAdapter}. A checkout that never ran `bench:setup` (the
 * library is not linked) degrades to a skipped arm instead of crashing.
 */
export const createRapierAdapter = async (): Promise<PhysicsAdapter | null> => {
  let R: typeof RAPIER;

  try {
    R = (await import('@dimforge/rapier2d-compat')) as typeof RAPIER;
    // One-time WASM initialisation, before any world is constructed. The bundled
    // glue prints a harmless upstream deprecation notice here — it is not an error.
    await R.init();
  } catch {
    console.warn(
      "[physics] rapier arm unavailable — '@dimforge/rapier2d-compat' is not linked or failed to init (run bench:setup). Skipping the rapier arm.",
    );

    return null;
  }

  let world: RAPIER.World | null = null;
  let perturbedSignature = '';

  /** Count collider pairs with at least one solid contact point, deduped by ordered handle pair. */
  const countTouchingContacts = (w: RAPIER.World): number => {
    const seen = new Set<string>();
    let touching = 0;

    w.forEachCollider(collider1 => {
      w.contactPairsWith(collider1, collider2 => {
        const a = collider1.handle;
        const b = collider2.handle;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);

        let hasContact = false;

        w.contactPair(collider1, collider2, manifold => {
          if (manifold.numContacts() > 0) {
            hasContact = true;
          }
        });

        if (hasContact) {
          touching++;
        }
      });
    });

    return touching;
  };

  return {
    engine: 'rapier',
    config: 'default',

    setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void {
      const scene = describePhysicsScene(spec, bodyCount, seed);

      perturbedSignature = scene.perturbedSignature;

      // +Y down, px world units: identical numeric frame to the exojs/matter arms.
      const created = new R.World({ x: spec.gravity.x, y: spec.gravity.y });

      created.timestep = 1 / 60;

      for (const desc of scene.bodies) {
        const bodyDesc = desc.type === 'static' ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic();

        bodyDesc.setTranslation(desc.x, desc.y);

        const body = created.createRigidBody(bodyDesc);

        const colliderDesc = (
          desc.shape.kind === 'box' ? R.ColliderDesc.cuboid(desc.shape.width / 2, desc.shape.height / 2) : R.ColliderDesc.ball(desc.shape.radius)
        )
          .setDensity(desc.density)
          .setFriction(desc.friction)
          .setRestitution(desc.restitution);

        created.createCollider(colliderDesc, body);

        if (desc.perturb) {
          // rapier linear velocity is world-units/s — the px/s impulse carries over unchanged.
          body.setLinvel({ x: desc.perturb.vx, y: desc.perturb.vy }, true);
        }
      }

      world = created;
    },

    step(dt: number): void {
      if (world === null) {
        throw new Error('rapier adapter: step() called before setup().');
      }

      // rapier steps its own fixed internal `world.timestep`; keep it pinned to the shared dt.
      world.timestep = dt;
      world.step();
    },

    sampleStructural(): PhysicsStructuralCounters {
      if (world === null) {
        throw new Error('rapier adapter: sampleStructural() called before setup().');
      }

      return {
        bodyCount: world.bodies.len(),
        contactCount: countTouchingContacts(world),
      };
    },

    teardown(): void {
      if (world !== null) {
        // Release the WASM-backed world (rapier holds native memory outside the JS heap).
        world.free();
        world = null;
      }
    },

    mutationSignature(): string {
      return perturbedSignature;
    },
  };
};
