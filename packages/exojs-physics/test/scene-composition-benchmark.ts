import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { type Application, Container, Scene, SceneDirector, Signal, Time } from '@codexo/exojs';
import { CircleShape, KinematicMovementComponent, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs/physics';

import { measureAllocationRate } from './allocationSampler';

const step = Time.seconds(1 / 60);
const bodyCount = 128;
const stepCount = 120;
const sampleCount = 11;
const direction = { x: 1, y: 0 };
const shape = new CircleShape(4);
const automatic = process.argv.includes('--automatic');
const rotated = process.argv.includes('--rotated');

class BenchScene extends Scene {}

const sample = async (measureAllocations = false) => {
  const director = new SceneDirector(
    {
      loader: { _releaseScope() {} },
      interaction: { attachRoot() {}, detachRoot() {}, attachUIRoot() {}, detachUIRoot() {} },
      onError: new Signal<[Error]>().add(error => {
        throw error;
      }),
    } as unknown as Application,
    { bench: BenchScene },
  );
  await director.change(BenchScene);
  const scene = director.currentScene!;
  const world = scene.systems.add(new PhysicsWorld({ interpolation: true, frameAlphaSource: () => 0.5 }));
  const parent = scene.root;

  if (rotated) {
    parent.setPosition(50, 40).setRotation(30);
  }

  const nodes: Container[] = [];
  const movements: KinematicMovementComponent[] = [];
  const start = performance.now();

  for (let i = 0; i < bodyCount; i++) {
    const node = new Container().setPosition(0, i * 12);
    const options = { type: 'kinematic' as const, colliders: [{ shape }] };
    const physics = node.addComponent(automatic ? new PhysicsBodyComponent(options) : new PhysicsBodyComponent(world, options));
    const speed = { maxSpeed: 60 };
    movements.push(node.addComponent(automatic ? new KinematicMovementComponent(speed) : new KinematicMovementComponent(physics, speed)));
    nodes.push(node);
  }

  const constructed = performance.now();

  for (const node of nodes) {
    parent.addChild(node);
  }

  const registered = performance.now();
  assert.equal(world.bodies.length, bodyCount);

  const advance = (): void => {
    for (const movement of movements) {
      movement.move(direction);
    }

    world.fixedUpdate(step);
  };

  let simulation = 0;
  let presentation = 0;

  for (let i = 0; i < stepCount; i++) {
    const beforeStep = performance.now();
    advance();
    const afterStep = performance.now();
    world.update(step);
    simulation += afterStep - beforeStep;
    presentation += performance.now() - afterStep;
  }

  const first = movements[0]!.body;
  assert.ok(first.x > stepCount / 2);
  const node = nodes[0]!;
  const presented = node.getWorldTransform();
  assert.ok(Math.abs(presented.x - (first.x + first.previousX) / 2) < 1e-6);

  const allocationOptions = { warmup: 60, iterations: 500 };
  const bytesPerTick = measureAllocations
    ? {
        simulation: (await measureAllocationRate(advance, allocationOptions)).bytesPerIteration,
        presentation: (await measureAllocationRate(() => world.update(step), allocationOptions)).bytesPerIteration,
      }
    : undefined;

  const beforeDisable = performance.now();

  for (const movement of movements) {
    movement.physics.enabled = false;
  }

  const disabled = performance.now();
  assert.equal(world.bodies.length, 0);
  director.destroy();

  return {
    construction: constructed - start,
    activation: registered - constructed,
    simulation,
    presentation,
    disable: disabled - beforeDisable,
    bytesPerTick,
  };
};

for (let i = 0; i < 4; i++) {
  await sample();
}

const samples: Array<Awaited<ReturnType<typeof sample>>> = [];

for (let i = 0; i < sampleCount; i++) {
  globalThis.gc?.();
  samples.push(await sample());
}

const metrics = ['construction', 'activation', 'simulation', 'presentation', 'disable'] as const;
const medianMs = Object.fromEntries(
  metrics.map(key => [
    key,
    samples
      .map(result => result[key])
      .sort((a, b) => a - b)
      [sampleCount >> 1]!.toFixed(3),
  ]),
);
const { bytesPerTick } = await sample(true);
console.log(JSON.stringify({ bodyCount, stepCount, sampleCount, automatic, rotated, medianMs, bytesPerTick }));
