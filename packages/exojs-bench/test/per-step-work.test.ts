import { createPerStepWork } from '../src/physics/adapters/perStepWork';
import { describePhysicsScene } from '../src/physics/adapters/scene';
import { PHYSICS_ARCHETYPES, seedFor } from '../src/physics/archetypes';
import type { PhysicsArchetypeSpec } from '../src/physics/PhysicsAdapter';

const joints = PHYSICS_ARCHETYPES.find(archetype => archetype.id === 'joints') as PhysicsArchetypeSpec;

/** An arm whose only observable behaviour is which body it was told to drive, and when. */
const recordingOps = () => {
  const kicks: { slot: number; vx: number; vy: number }[] = [];
  const handles: number[] = [];

  return {
    handles,
    kicks,
    ops: {
      createBody: () => handles.length,
      removeBody: () => undefined,
      castRay: () => false,
      setVelocity: (body: number, vx: number, vy: number) => {
        kicks.push({ slot: body, vx, vy });
      },
    },
  };
};

describe('createPerStepWork drive', () => {
  test('re-applies the descriptor velocity to exactly the perturbed bodies on the kick cadence', () => {
    const scene = describePhysicsScene(joints, 4_500, seedFor(joints.scene, 4_500));
    const { handles, kicks, ops } = recordingOps();

    scene.bodies.forEach((_, index) => handles.push(index));

    const work = createPerStepWork(joints, scene, handles, ops);
    const cadence = joints.kickEverySteps as number;

    work.run(0);
    const atZero = kicks.length;

    work.run(1);
    expect(kicks.length).toBe(atZero);

    work.run(cadence);
    expect(kicks.length).toBe(atZero * 2);

    const driven = scene.bodies.map((body, slot) => ({ slot, perturb: body.perturb })).filter(entry => entry.perturb !== undefined);

    expect(atZero).toBe(driven.length);
    expect(kicks.slice(0, atZero)).toEqual(driven.map(entry => ({ slot: entry.slot, vx: entry.perturb?.vx, vy: entry.perturb?.vy })));
  });

  test('is idle for an archetype that neither drives, churns nor casts', () => {
    const stack = PHYSICS_ARCHETYPES.find(archetype => archetype.id === 'box-stack') as PhysicsArchetypeSpec;
    const scene = describePhysicsScene(stack, 1_500, seedFor(stack.scene, 1_500));
    const { handles, kicks, ops } = recordingOps();

    scene.bodies.forEach((_, index) => handles.push(index));

    const work = createPerStepWork(stack, scene, handles, ops);

    for (let step = 0; step < 120; step++) {
      work.run(step);
    }

    expect(kicks).toEqual([]);
  });
});
