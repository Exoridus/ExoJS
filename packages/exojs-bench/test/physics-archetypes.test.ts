import { describePhysicsScene, rayForStep } from '../src/physics/adapters/scene';
import { PHYSICS_ARCHETYPES, seedFor, warmupStepsFor, warmupStepsForArchetype } from '../src/physics/archetypes';
import type { PhysicsArchetypeId, PhysicsArchetypeSpec } from '../src/physics/PhysicsAdapter';

const byId = Object.fromEntries(PHYSICS_ARCHETYPES.map(archetype => [archetype.id, archetype])) as Record<PhysicsArchetypeId, PhysicsArchetypeSpec>;

/** Scene for a cell, at the deterministic seed the driver would give it. */
const sceneFor = (id: PhysicsArchetypeId, bodyCount: number): ReturnType<typeof describePhysicsScene> =>
  describePhysicsScene(byId[id], bodyCount, seedFor(byId[id].scene, bodyCount));

/**
 * Body counts two archetypes can be read against each other at.
 *
 * `seedFor` keys on the scene AND the body count, so two archetypes that name
 * the same scene build the byte-identical world only at a count both ladders
 * contain. A pair meant to be read as a delta must therefore share at least one
 * rung; identical ladders are one way to get that and not the requirement.
 */
const sharedRungs = (a: PhysicsArchetypeId, b: PhysicsArchetypeId): number[] => byId[a].bodyCounts.filter(count => byId[b].bodyCounts.includes(count));

describe('raycast', () => {
  test('simulates the mixed scene unchanged, so the delta against it is query cost', () => {
    const raycast = byId.raycast;
    const base = byId['mixed-static-dynamic'];

    expect(raycast.scene).toBe(base.scene);
    expect(raycast.gravity).toEqual(base.gravity);
    expect(raycast.perturbFraction).toBe(base.perturbFraction);
    expect(raycast.bodyCounts).toEqual(base.bodyCounts);
  });

  test('shares a body count with the mixed scene, without which no delta could be taken', () => {
    expect(sharedRungs('raycast', 'mixed-static-dynamic').length).toBeGreaterThan(0);
  });

  test('builds the byte-identical body list its base archetype does', () => {
    expect(sceneFor('raycast', 200).bodies).toEqual(sceneFor('mixed-static-dynamic', 200).bodies);
  });

  test('casts a nonzero ray budget', () => {
    expect(byId.raycast.raysPerStep).toBeGreaterThan(0);
  });
});

describe('rayForStep', () => {
  const extent = { width: 1_000, height: 600 };

  test('is a closed form in (index, step), so a re-run casts the identical sweep', () => {
    expect(rayForStep(3, 64, 17, extent)).toEqual(rayForStep(3, 64, 17, extent));
  });

  test('returns a unit direction, which is what the arms treat as a distance scale', () => {
    for (const step of [0, 1, 13, 240]) {
      const ray = rayForStep(5, 64, step, extent);

      expect(Math.hypot(ray.dx, ray.dy)).toBeCloseTo(1, 10);
    }
  });

  test('successive steps move the sweep, so no arm can answer it from one cached traversal', () => {
    const first = rayForStep(0, 64, 0, extent);
    const second = rayForStep(0, 64, 1, extent);

    expect(second.y).not.toBeCloseTo(first.y, 3);
  });

  test('stays inside the scene extent', () => {
    for (let step = 0; step < 50; step++) {
      for (let index = 0; index < 64; index++) {
        const ray = rayForStep(index, 64, step, extent);

        expect(ray.y).toBeGreaterThanOrEqual(0);
        expect(ray.y).toBeLessThanOrEqual(extent.height);
      }
    }
  });
});

describe('body-churn', () => {
  test('simulates the many-dynamic scene and differs only in what the selection means', () => {
    const churn = byId['body-churn'];

    expect(churn.scene).toBe(byId['many-dynamic'].scene);
    expect(churn.gravity).toEqual(byId['many-dynamic'].gravity);
    expect(churn.churn).toBe(true);
  });

  test('shares a body count with many-dynamic, and builds the identical layout there', () => {
    const shared = sharedRungs('body-churn', 'many-dynamic');

    expect(shared.length).toBeGreaterThan(0);

    // The impulses differ by construction - a body that lives one step gets
    // none - so the layout is what has to match for the delta to carry one cause.
    const layout = (id: PhysicsArchetypeId, bodyCount: number): unknown =>
      sceneFor(id, bodyCount).bodies.map(body => ({ ...body, perturb: undefined }));

    for (const bodyCount of shared) {
      expect(layout('body-churn', bodyCount)).toEqual(layout('many-dynamic', bodyCount));
    }
  });

  test('churns a nonempty subset of the dynamic bodies, never all of them', () => {
    const scene = sceneFor('body-churn', 1_000);

    expect(scene.churnIndices.length).toBeGreaterThan(0);
    expect(scene.churnIndices.length).toBeLessThan(1_000);
  });

  test('leaves the churned bodies unperturbed, since a body that lives one step has no initial impulse', () => {
    expect(sceneFor('body-churn', 200).bodies.some(body => body.perturb !== undefined)).toBe(false);
  });

  test('dynamicOffset addresses the dynamic bodies the churn indices name', () => {
    const scene = sceneFor('body-churn', 200);

    for (const index of scene.churnIndices) {
      expect(scene.bodies[scene.dynamicOffset + index]!.type).toBe('dynamic');
    }
  });
});

describe('joints', () => {
  test('is the only archetype that builds constraints', () => {
    const withJoints = PHYSICS_ARCHETYPES.filter(archetype => sceneFor(archetype.id, 200).joints.length > 0);

    expect(withJoints.map(archetype => archetype.id)).toEqual(['joints']);
  });

  test('builds one constraint per dynamic body: every link is pinned to its predecessor', () => {
    const scene = sceneFor('joints', 200);

    expect(scene.joints).toHaveLength(200);
  });

  test('chains hang from static anchors, so each chain has exactly one static root', () => {
    const scene = sceneFor('joints', 200);
    const chainLength = byId.joints.jointChainLength!;
    const statics = scene.bodies.filter(body => body.type === 'static');

    expect(statics).toHaveLength(Math.ceil(200 / chainLength));
  });

  test('every joint pins two distinct bodies at a pivot on their shared seam', () => {
    const scene = sceneFor('joints', 200);

    for (const joint of scene.joints) {
      expect(joint.bodyA).not.toBe(joint.bodyB);
      expect(scene.bodies[joint.bodyA]).toBeDefined();
      expect(scene.bodies[joint.bodyB]).toBeDefined();
    }
  });
});

describe('settling-pile', () => {
  test('simulates the many-dynamic scene unchanged except for its dynamic material', () => {
    const settling = byId['settling-pile'];
    const base = byId['many-dynamic'];

    expect(settling.scene).toBe(base.scene);
    expect(settling.gravity).toEqual(base.gravity);
    expect(settling.perturbFraction).toBe(base.perturbFraction);
    expect(settling.dynamicMaterial).not.toEqual(base.dynamicMaterial);
  });

  // The two archetypes reach the frame budget at body counts nearly three times
  // apart, so they carry different ladders and cannot share all of one. What the
  // sleeping comparison actually needs is a count at which both build the same
  // world, and that is what is asserted.
  test('shares a body count with many-dynamic, without which the sleeping delta could not be taken', () => {
    expect(sharedRungs('settling-pile', 'many-dynamic').length).toBeGreaterThan(0);
  });

  test('gives its dynamic bodies nonzero friction and zero restitution, so the pile can come to rest', () => {
    expect(byId['settling-pile'].dynamicMaterial).toEqual({ friction: 0.5, restitution: 0 });
  });

  test('builds the byte-identical layout its base archetype does, differing only in material', () => {
    const shared = sharedRungs('settling-pile', 'many-dynamic')[0]!;
    const settlingBodies = sceneFor('settling-pile', shared).bodies;
    const baseBodies = sceneFor('many-dynamic', shared).bodies;

    expect(settlingBodies).toHaveLength(baseBodies.length);

    for (const [index, body] of settlingBodies.entries()) {
      const baseBody = baseBodies[index]!;

      expect({ ...body, friction: undefined, restitution: undefined }).toEqual({ ...baseBody, friction: undefined, restitution: undefined });
    }
  });

  test('leaves many-dynamic itself frictionless and bouncy', () => {
    const bodies = sceneFor('many-dynamic', 200).bodies;
    const dynamicBodies = bodies.filter(body => body.type === 'dynamic');

    expect(dynamicBodies.length).toBeGreaterThan(0);

    for (const body of dynamicBodies) {
      expect(body.friction).toBe(0);
      expect(body.restitution).toBe(0.4);
    }
  });

  test('applies the override to every dynamic body of the settling pile', () => {
    const dynamicBodies = sceneFor('settling-pile', 200).bodies.filter(body => body.type === 'dynamic');

    expect(dynamicBodies.length).toBeGreaterThan(0);

    for (const body of dynamicBodies) {
      expect(body.friction).toBe(0.5);
      expect(body.restitution).toBe(0);
    }
  });

  test('names a warmup override for every one of its body counts, each larger than the shared schedule', () => {
    const settling = byId['settling-pile'];

    expect(settling.warmupStepsOverride).toBeDefined();

    for (const bodyCount of settling.bodyCounts) {
      expect(settling.warmupStepsOverride![bodyCount]).toBeGreaterThan(warmupStepsFor(bodyCount));
    }
  });

  test('warmupStepsForArchetype resolves the override for the settling pile', () => {
    const settling = byId['settling-pile'];

    for (const bodyCount of settling.bodyCounts) {
      expect(warmupStepsForArchetype(settling, bodyCount)).toBe(settling.warmupStepsOverride![bodyCount]);
    }
  });
});

describe('body-count ladders', () => {
  test('each archetype carries its own ladder, ascending and without a repeated rung', () => {
    for (const archetype of PHYSICS_ARCHETYPES) {
      const rungs = [...archetype.bodyCounts];

      expect(rungs.length).toBeGreaterThan(0);
      expect(new Set(rungs).size).toBe(rungs.length);
      expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
    }
  });

  test('the ladders are not one shared ladder: the archetypes reach a frame at different sizes', () => {
    const ladders = new Set(PHYSICS_ARCHETYPES.map(archetype => archetype.bodyCounts.join(',')));

    expect(ladders.size).toBeGreaterThan(1);
  });

  test('every archetype read as a delta against another shares a rung with it', () => {
    const deltas: ReadonlyArray<readonly [PhysicsArchetypeId, PhysicsArchetypeId]> = [
      ['raycast', 'mixed-static-dynamic'],
      ['body-churn', 'many-dynamic'],
      ['settling-pile', 'many-dynamic'],
    ];

    for (const [archetype, base] of deltas) {
      expect(byId[archetype].scene).toBe(byId[base].scene);
      expect(sharedRungs(archetype, base).length).toBeGreaterThan(0);
    }
  });

  test('an archetype naming a warmup override names one for every rung of its own ladder', () => {
    for (const archetype of PHYSICS_ARCHETYPES) {
      if (archetype.warmupStepsOverride === undefined) continue;

      // An override keyed on a count the ladder no longer contains is silently
      // inert: the cell falls back to the shared schedule, which for this
      // archetype times a transient rather than its steady state.
      for (const bodyCount of archetype.bodyCounts) {
        expect(archetype.warmupStepsOverride[bodyCount]).toBeDefined();
      }

      expect(Object.keys(archetype.warmupStepsOverride).map(Number).sort((a, b) => a - b)).toEqual([...archetype.bodyCounts]);
    }
  });
});

describe('warmupStepsForArchetype', () => {
  test('falls back to the shared schedule for every archetype that names no override', () => {
    for (const archetype of PHYSICS_ARCHETYPES) {
      if (archetype.warmupStepsOverride !== undefined) continue;

      for (const bodyCount of archetype.bodyCounts) {
        expect(warmupStepsForArchetype(archetype, bodyCount)).toBe(warmupStepsFor(bodyCount));
      }
    }
  });

  test('leaves every pre-existing archetype on the shared schedule, unaffected by the settling-pile override', () => {
    for (const id of ['box-stack', 'many-dynamic', 'mixed-static-dynamic', 'raycast', 'body-churn', 'joints'] as const) {
      const archetype = byId[id];

      expect(archetype.warmupStepsOverride).toBeUndefined();

      for (const bodyCount of archetype.bodyCounts) {
        expect(warmupStepsForArchetype(archetype, bodyCount)).toBe(warmupStepsFor(bodyCount));
      }
    }
  });
});

describe('scene shapes', () => {
  test('every archetype names a scene, and the pre-existing three name their own id', () => {
    for (const id of ['box-stack', 'many-dynamic', 'mixed-static-dynamic'] as const) {
      expect(byId[id].scene).toBe(id);
    }
  });

  test('every scene puts its statics first, which is what dynamicOffset relies on', () => {
    for (const archetype of PHYSICS_ARCHETYPES) {
      const scene = sceneFor(archetype.id, 200);
      const firstDynamic = scene.bodies.findIndex(body => body.type === 'dynamic');
      const lastStatic = scene.bodies.reduce((last, body, index) => (body.type === 'static' ? index : last), -1);

      expect(scene.dynamicOffset).toBe(firstDynamic);
      expect(lastStatic).toBeLessThan(firstDynamic);
    }
  });

  test('every scene reports a positive extent for the ray sweep to span', () => {
    for (const archetype of PHYSICS_ARCHETYPES) {
      const { extent } = sceneFor(archetype.id, 200);

      expect(extent.width).toBeGreaterThan(0);
      expect(extent.height).toBeGreaterThan(0);
    }
  });
});
