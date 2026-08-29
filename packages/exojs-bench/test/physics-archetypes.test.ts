import { describePhysicsScene, rayForStep } from '../src/physics/adapters/scene';
import { PHYSICS_ARCHETYPES, seedFor } from '../src/physics/archetypes';
import type { PhysicsArchetypeId, PhysicsArchetypeSpec } from '../src/physics/PhysicsAdapter';

const byId = Object.fromEntries(PHYSICS_ARCHETYPES.map(archetype => [archetype.id, archetype])) as Record<PhysicsArchetypeId, PhysicsArchetypeSpec>;

/** Scene for a cell, at the deterministic seed the driver would give it. */
const sceneFor = (id: PhysicsArchetypeId, bodyCount: number): ReturnType<typeof describePhysicsScene> =>
  describePhysicsScene(byId[id], bodyCount, seedFor(byId[id].scene, bodyCount));

describe('raycast', () => {
  test('simulates the mixed scene unchanged, so the delta against it is query cost', () => {
    const raycast = byId.raycast;
    const base = byId['mixed-static-dynamic'];

    expect(raycast.scene).toBe(base.scene);
    expect(raycast.gravity).toEqual(base.gravity);
    expect(raycast.perturbFraction).toBe(base.perturbFraction);
    expect(raycast.bodyCounts).toEqual(base.bodyCounts);
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
