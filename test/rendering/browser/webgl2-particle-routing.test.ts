import { Time } from '#core/units';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Texture } from '#rendering/texture/Texture';

import {
  ApplyForce,
  DeathModule,
  type ParticleDeathContext,
  particlesExtension,
  ParticleSystem,
  UpdateModule,
} from '../../../packages/exojs-particles/src/index';
import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const texture = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 8, 8);
  return new Texture(canvas);
};

test('transform feedback renders moving quads beside CPU systems without uploading stale positions', async () => {
  const backend = await createWebGl2TestBackend(64);
  materializeRendererBindings(backend, particlesExtension.renderers!);
  const image = texture();
  const root = new Container();
  const gpu = new ParticleSystem(image, { capacity: 4 });
  const cpu = new ParticleSystem(image, { capacity: 4, simulation: 'cpu' });
  root.addChild(gpu, cpu);
  try {
    const a = gpu.emit()!;
    a.position.set(12, 20);
    a.velocity.set(24, 0);
    a.color = 0xff0000ff;
    a.lifetime = 10;
    const b = cpu.emit()!;
    b.position.set(44, 44);
    b.color = 0xff00ff00;
    b.lifetime = 10;
    renderWebGl2Once(backend, root);
    gpu.update(Time.seconds(0.5));
    cpu.update(Time.seconds(0.5));
    expect(gpu.simulationBackend).toBe('webgl2');
    expect(cpu.simulationBackend).toBe('cpu');
    expect(gpu._storage.posX[0]).toBe(12);
    renderWebGl2Once(backend, root);
    expectPixelNear(readWebGl2Pixel(backend, 24, 20), [255, 0, 0, 255]);
    expectPixelNear(readWebGl2Pixel(backend, 12, 20), [0, 0, 0, 255]);
    expectPixelNear(readWebGl2Pixel(backend, 44, 44), [0, 255, 0, 255]);
    gpu.addUpdateModule(new ApplyForce(0, 4));
    gpu.update(Time.seconds(0.5));
    renderWebGl2Once(backend, root);
    expectPixelNear(readWebGl2Pixel(backend, 36, 20), [255, 0, 0, 255]);
    const state = gpu.glState!;
    gpu.addUpdateModule(
      new (class extends UpdateModule {
        apply(): void {}
      })(),
    );
    gpu.update(Time.seconds(0));
    expect(gpu.simulationBackend).toBe('cpu');
    expect(gpu.aliveCount).toBe(0);
    expect(state.destroyed).toBe(true);
    const next = gpu.emit()!;
    next.position.set(20, 20);
    renderWebGl2Once(backend, root);
    expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 255, 255, 255]);
    expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
  } finally {
    root.destroy();
    image.destroy();
    backend.destroy();
  }
});

test.each([false, true])('backend teardown releases transform feedback before/after GPU drawing (%s)', async drawGpu => {
  const backend = await createWebGl2TestBackend(64);
  materializeRendererBindings(backend, particlesExtension.renderers!);
  const image = texture();
  const system = new ParticleSystem(image, { capacity: 4 });
  try {
    system.emit();
    renderWebGl2Once(backend, system);
    system.update(Time.seconds(0));
    if (drawGpu) renderWebGl2Once(backend, system);
    const state = system.glState!;
    backend.destroy();
    expect(state.destroyed).toBe(true);
    system.destroy();
    system.update(Time.seconds(1));
    expect(system.gpuMode).toBe(false);
    expect(system.aliveCount).toBe(0);
  } finally {
    system.destroy();
    image.destroy();
  }
});

test('context restoration restarts simulation on the same backend and removes system listeners', async () => {
  const backend = await createWebGl2TestBackend(64);
  materializeRendererBindings(backend, particlesExtension.renderers!);
  const image = texture();
  const system = new ParticleSystem(image, { capacity: 4 });
  const listeners = backend.onContextLost.count;
  try {
    system.emit()!.position.set(24, 24);
    renderWebGl2Once(backend, system);
    system.update(Time.seconds(0));
    renderWebGl2Once(backend, system);
    const old = system.glState!;
    const restored = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Context restore timed out')), 5000);
      backend.onContextRestored.once(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    backend.context.getExtension('WEBGL_lose_context')!.loseContext();
    await restored;
    expect(old.destroyed).toBe(true);
    expect(system.aliveCount).toBe(0);
    system.emit()!.position.set(24, 24);
    system.update(Time.seconds(0));
    expect(system.simulationBackend).toBe('webgl2');
    expect(system.glState).not.toBe(old);
    renderWebGl2Once(backend, system);
    expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 255, 255, 255]);
    system.destroy();
    expect(backend.onContextLost.count).toBe(listeners);
  } finally {
    system.destroy();
    image.destroy();
    backend.destroy();
  }
});

test('insufficient vertex texture capability selects CPU before allocating transform feedback', async () => {
  const backend = await createWebGl2TestBackend(64);
  materializeRendererBindings(backend, particlesExtension.renderers!);
  const image = texture();
  const system = new ParticleSystem(image, { capacity: 4 });
  const gl = backend.context;
  const getParameter = gl.getParameter.bind(gl);
  try {
    renderWebGl2Once(backend, system);
    vi.spyOn(gl, 'getParameter').mockImplementation((parameter: number) => (parameter === gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS ? 0 : getParameter(parameter)));
    system.emit()!.velocity.set(4, 0);
    system.update(Time.seconds(0.25));
    expect(system.simulationBackend).toBe('cpu');
    expect(system.glState).toBeNull();
    expect(system._storage.posX[0]).toBe(1);
  } finally {
    vi.restoreAllMocks();
    system.destroy();
    image.destroy();
    backend.destroy();
  }
});

test('removing death modules cancels staged and backlogged lifetimes before slot reuse', async () => {
  const backend = await createWebGl2TestBackend(64);
  materializeRendererBindings(backend, particlesExtension.renderers!);
  const image = texture();
  const system = new ParticleSystem(image, { capacity: 1 });
  const deaths: ParticleDeathContext[] = [];
  class Recorder extends DeathModule {
    onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
      deaths.push(death);
    }
  }
  try {
    system.addDeathModule(new Recorder());
    renderWebGl2Once(backend, system);
    for (let i = 0; i < 4; i++) {
      system.emit()!.lifetime = 0.25;
      system.update(Time.seconds(0.5));
    }
    system.clearDeathModules();
    system.update(Time.seconds(0));
    system.addDeathModule(new Recorder());
    system.emit()!.lifetime = 0.75;
    system.update(Time.seconds(1));
    await vi.waitFor(() => expect(deaths).toHaveLength(1));
    expect(deaths[0]!.lifetime).toBe(0.75);
    expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
  } finally {
    system.destroy();
    image.destroy();
    backend.destroy();
  }
});
