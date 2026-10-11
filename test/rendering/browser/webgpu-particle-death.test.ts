import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { type Seconds, Time } from '#core/units';
import { materializeRendererBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import type { ParticleBatch, ParticleDeathContext, WgslContribution } from '../../../packages/exojs-particles/src/index';
import { DeathModule, particlesExtension, ParticleSystem, UpdateModule } from '../../../packages/exojs-particles/src/index';
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

const tick = (value: number): Seconds => Time.seconds(value);

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

class TerminalState extends UpdateModule {
  public override apply(particles: ParticleBatch, dt: number): void {
    for (let i = 0; i < particles.count; i++) {
      particles.velocity.x[i] = particles.velocity.x[i]! + 8 * dt;
      particles.velocity.y[i] = particles.velocity.y[i]! - 4 * dt;
      particles.scale.x[i] = particles.timing.elapsed[i]! / particles.timing.lifetime[i]!;
      particles.scale.y[i] = particles.scale.x[i]! * 2;
      particles.rotation.angle[i] = particles.rotation.angle[i]! + dt;
      particles.color[i] = particles.timing.elapsed[i]! >= particles.timing.lifetime[i]! ? 0x80402010 : 0xffabcdef;
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'TerminalState',
      body: `
        velocities[idx] = velocities[idx] + vec2<f32>(8.0, -4.0) * dt;
        scales[idx] = vec2<f32>(1.0, 2.0) * (timing[idx].x / timing[idx].y);
        rotInfo[idx].x = rotInfo[idx].x + dt;
        color[idx] = select(0xffabcdefu, 0x80402010u, timing[idx].x >= timing[idx].y);
      `,
    };
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
    // Lifetime survives the device's terminal marker unchanged.
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

  test.each([
    { name: 'after earlier steps', steps: [0, 0.125, 0.125, 0.125], lifetime: 0.3 },
    { name: 'in its spawn update', steps: [0.125], lifetime: 0.1 },
  ])('terminal modules and every death field match CPU $name', async ({ steps, lifetime }) => {
    const backend = await setupBackend();
    const texture = createTexture();
    const cpu = new ParticleSystem(texture, { capacity: 1 });
    const gpu = new ParticleSystem(texture, { capacity: 1 });
    const cpuDeaths = new RecordDeaths();
    const gpuDeaths = new RecordDeaths();

    try {
      for (const [system, deaths] of [
        [cpu, cpuDeaths],
        [gpu, gpuDeaths],
      ] as const) {
        system.addUpdateModule(new TerminalState());
        system.addDeathModule(deaths);
        const particle = system.emit()!;

        particle.position.set(17, -9);
        particle.velocity.set(12, -6);
        particle.rotation = 0.25;
        particle.rotationSpeed = 2;
        particle.lifetime = lifetime;
      }

      gpu.render(backend);
      backend.flush();

      for (const dt of steps) {
        cpu.update(tick(dt));
        gpu.update(tick(dt));
        gpu.render(backend);
        backend.flush();
      }

      expect(gpu.gpuMode).toBe(true);
      await runUntil(gpu, backend, () => gpuDeaths.records.length > 0);
      expect(cpuDeaths.records).toHaveLength(1);
      expect(gpuDeaths.records).toHaveLength(1);
      const expected = cpuDeaths.records[0]!;
      const actual = gpuDeaths.records[0]!;

      // Binary-exact timesteps isolate Float32 storage rounding from LUT approximation.
      for (const field of ['x', 'y', 'velocityX', 'velocityY', 'rotation', 'scaleX', 'scaleY', 'elapsed', 'lifetime'] as const) {
        expect(actual[field]).toBeCloseTo(expected[field], 5);
      }

      expect(actual.color).toBe(expected.color);
      expect(actual.color).toBe(0x80402010);
    } finally {
      cpu.destroy();
      gpu.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('uninitialized holes stay invisible when modules assign scale and color', async () => {
    const backend = await setupBackend();
    const texture = createTexture();
    const system = new ParticleSystem(texture, { capacity: 2 });
    const staging = backend.device.createBuffer({ size: 40, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

    try {
      system.addUpdateModule(new TerminalState());
      system.emit();
      system.emit()!.lifetime = 10;
      system._storage.alive[0] = 0;
      system.render(backend);
      backend.flush();
      system.update(tick(0.125));
      const encoder = backend.device.createCommandEncoder();

      encoder.copyBufferToBuffer(system.gpuState!.instanceBuffer, 0, staging, 0, 40);
      backend.device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      expect([...new Uint32Array(staging.getMappedRange())]).toEqual(Array<number>(10).fill(0));
      staging.unmap();
    } finally {
      staging.destroy();
      system.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test.each(['clearParticles', 'destroy'] as const)('%s discards death callbacks still awaiting readback', async action => {
    const backend = await setupBackend();
    const texture = createTexture();
    const system = new ParticleSystem(texture, { capacity: 1 });
    const deaths = new RecordDeaths();

    try {
      system.addDeathModule(deaths);
      system.render(backend);
      backend.flush();
      system.emit()!.lifetime = 0.1;
      system.update(tick(0));
      system.update(tick(0.125));
      system[action]();
      await backend.device.queue.onSubmittedWorkDone();
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(deaths.records).toHaveLength(0);
    } finally {
      if (action !== 'destroy') {
        system.destroy();
      }

      texture.destroy();
      backend.destroy();
    }
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
