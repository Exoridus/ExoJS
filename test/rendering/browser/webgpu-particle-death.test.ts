/**
 * WebGPU particle death-context browser tests.
 *
 * A death module observes a particle that the GPU has been integrating. The CPU
 * copy of position/velocity/scale/rotation/colour stops at the spawn values in
 * GPU mode - only the compute shader advances them, and nothing reads them back
 * - so a death callback that reads CPU storage sees where the particle was BORN,
 * not where it died. Sub-emitters built on it fire in the wrong place on WebGPU
 * and in the right place on WebGL2.
 *
 * These tests run the real compute pipeline, so they fail on a death context
 * that is not backend-true. A jsdom test cannot cover this: with a mocked device
 * nothing integrates, and the stale value and the correct one are the same
 * number.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Time } from '#core/Time';
import { materializeRendererBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import type { ParticleDeathContext } from '../../../packages/exojs-particles/src/index';
import { DeathModule, particlesExtension, ParticleSystem } from '../../../packages/exojs-particles/src/index';
import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  const { renderers } = particlesExtension;

  if (!renderers) {
    throw new Error('particlesExtension exposes no renderer bindings');
  }

  materializeRendererBindings(backend, renderers);

  return backend;
};

const createTexture = (size = 8): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

const tick = (seconds: number): Time => Time.zero.clone().set(seconds * 1000);

/**
 * Runs frames until `settled` reports true, or gives up after `frames`.
 *
 * A GPU death is reported once its readback lands, which is a frame or two
 * later depending on how far ahead the queue is running - so a test waits for
 * the delivery rather than assuming a fixed number of frames.
 */
const runUntil = async (system: ParticleSystem, backend: WebGpuBackend, settled: () => boolean, budgetMs = 6000): Promise<void> => {
  const deadline = performance.now() + budgetMs;

  while (!settled() && performance.now() < deadline) {
    // A macrotask rather than an animation frame: this lane runs headless with
    // many suites in flight, where rAF is throttled well below the rate the
    // readback lands at. The bound is wall-clock for the same reason - how many
    // frames a delivery takes depends on how busy the device is.
    await new Promise(resolve => setTimeout(resolve, 4));
    system.update(tick(0.016));
    system.render(backend);
    backend.flush();
  }
};

/** Records what the death context reported for every particle that expired. */
class RecordDeaths extends DeathModule {
  public readonly records: ParticleDeathContext[] = [];

  public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
    this.records.push(death);
  }
}

describe('WebGPU particle death context', () => {
  test('a death callback sees where the particle died, not where it was born', async () => {
    const backend = await setupBackend();
    const texture = createTexture();
    const system = new ParticleSystem(texture, { capacity: 8 });
    const deaths = new RecordDeaths();

    system.addDeathModule(deaths);

    // One frame first: the system captures the backend while it is collected,
    // which is what routes the next update onto the compute pipeline.
    system.render(backend);
    backend.flush();

    const particle = system.emit()!;

    particle.velocity.set(100, 0);
    particle.lifetime = 0.15;

    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    // Two integration steps at 100 px/s, then expiry on the third.
    for (let frame = 0; frame < 3; frame++) {
      system.update(tick(0.06));
      system.render(backend);
      backend.flush();
    }

    await runUntil(system, backend, () => deaths.records.length > 0);

    expect(deaths.records).toHaveLength(1);
    expect(deaths.records[0]!.x).toBeGreaterThan(10);
    expect(deaths.records[0]!.velocityX).toBeCloseTo(100, 1);
    // The lifetime is the CPU's own value; the device only ever saw the sentinel.
    expect(deaths.records[0]!.lifetime).toBeCloseTo(0.15, 4);
  });

  test('the GPU reports the same death position the CPU path would', async () => {
    const backend = await setupBackend();
    const texture = createTexture();
    const gpuSystem = new ParticleSystem(texture, { capacity: 8 });
    const gpuDeaths = new RecordDeaths();

    gpuSystem.addDeathModule(gpuDeaths);
    gpuSystem.render(backend);
    backend.flush();

    const gpuParticle = gpuSystem.emit()!;

    gpuParticle.velocity.set(100, -50);
    gpuParticle.lifetime = 0.15;

    gpuSystem.update(tick(0));
    expect(gpuSystem.gpuMode).toBe(true);

    for (let frame = 0; frame < 3; frame++) {
      gpuSystem.update(tick(0.06));
      gpuSystem.render(backend);
      backend.flush();
    }

    await runUntil(gpuSystem, backend, () => gpuDeaths.records.length > 0);

    // Same emission, same ticks, but never collected by a backend - so it runs
    // the CPU pipeline and reports its death from CPU storage.
    const cpuSystem = new ParticleSystem(texture, { capacity: 8 });
    const cpuDeaths = new RecordDeaths();

    cpuSystem.addDeathModule(cpuDeaths);

    const cpuParticle = cpuSystem.emit()!;

    cpuParticle.velocity.set(100, -50);
    cpuParticle.lifetime = 0.15;

    cpuSystem.update(tick(0));
    expect(cpuSystem.gpuMode).toBe(false);

    for (let frame = 0; frame < 3; frame++) {
      cpuSystem.update(tick(0.06));
    }

    expect(cpuDeaths.records).toHaveLength(1);
    expect(gpuDeaths.records).toHaveLength(1);
    expect(gpuDeaths.records[0]!.x).toBeCloseTo(cpuDeaths.records[0]!.x, 2);
    expect(gpuDeaths.records[0]!.y).toBeCloseTo(cpuDeaths.records[0]!.y, 2);
    expect(gpuDeaths.records[0]!.velocityX).toBeCloseTo(cpuDeaths.records[0]!.velocityX, 2);
    expect(gpuDeaths.records[0]!.velocityY).toBeCloseTo(cpuDeaths.records[0]!.velocityY, 2);
  });

  test('deaths in consecutive frames are all delivered exactly once', async () => {
    const backend = await setupBackend();
    const texture = createTexture();
    const system = new ParticleSystem(texture, { capacity: 64 });
    const deaths = new RecordDeaths();

    system.addDeathModule(deaths);
    system.render(backend);
    backend.flush();

    const total = 8;

    for (let i = 0; i < total; i++) {
      const particle = system.emit()!;

      // Distinct velocity per particle, so a record identifies its particle.
      particle.velocity.set(100 + i, 0);
      particle.lifetime = 0.016 * (i + 1) + 0.001;
    }

    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    // No yield between frames: every readback is still in flight when the next
    // frame reports its own deaths, which is what a real frame loop does when
    // the map takes longer than a frame.
    for (let frame = 0; frame < total + 2; frame++) {
      system.update(tick(0.016));
      system.render(backend);
      backend.flush();
    }

    await runUntil(system, backend, () => deaths.records.length >= total);

    expect(deaths.records).toHaveLength(total);

    const reported = deaths.records.map(record => Math.round(record.velocityX)).sort((a, b) => a - b);

    expect(reported).toEqual(Array.from({ length: total }, (_, i) => 100 + i));
  });

  test('a slot reused before the readback lands does not rewrite the snapshot', async () => {
    const backend = await setupBackend();
    const texture = createTexture();
    // One slot, so the emission after the death is guaranteed to recycle it.
    const system = new ParticleSystem(texture, { capacity: 1 });
    const deaths = new RecordDeaths();

    system.addDeathModule(deaths);
    system.render(backend);
    backend.flush();

    const first = system.emit()!;

    first.velocity.set(100, 0);
    first.lifetime = 0.15;

    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    for (let frame = 0; frame < 3; frame++) {
      system.update(tick(0.06));
      system.render(backend);
      backend.flush();
    }

    const reused = system.emit();

    if (reused) {
      reused.position.set(-999, -999);
      reused.lifetime = 10;
    }

    await runUntil(system, backend, () => deaths.records.length > 0);

    expect(deaths.records).toHaveLength(1);
    expect(deaths.records[0]!.x).toBeGreaterThan(10);
    expect(deaths.records[0]!.x).not.toBeCloseTo(-999, 0);
  });
});
