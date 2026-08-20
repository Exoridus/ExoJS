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

interface DeathRecord {
  x: number;
  y: number;
  velocityX: number;
}

/** Records what the death context reported for every particle that expired. */
class RecordDeaths extends DeathModule {
  public readonly records: DeathRecord[] = [];

  public override onDeath(system: ParticleSystem, slot: number): void {
    this.records.push({
      x: system.posX[slot] ?? Number.NaN,
      y: system.posY[slot] ?? Number.NaN,
      velocityX: system.velX[slot] ?? Number.NaN,
    });
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

    const slot = system.spawn();

    system.posX[slot] = 0;
    system.posY[slot] = 0;
    system.velX[slot] = 100;
    system.scaleX[slot] = 1;
    system.scaleY[slot] = 1;
    system.color[slot] = Color.white.toRgba();
    system.lifetime[slot] = 0.15;

    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    // Two integration steps at 100 px/s, then expiry on the third.
    for (let frame = 0; frame < 3; frame++) {
      system.update(tick(0.06));
      system.render(backend);
      backend.flush();
    }

    // The readback that carries a GPU death is asynchronous; drain a few frames
    // so a backend-true context has landed before the assertion.
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      system.update(tick(0.016));
      system.render(backend);
      backend.flush();
    }

    expect(deaths.records).toHaveLength(1);
    expect(deaths.records[0]!.x).toBeGreaterThan(10);
    expect(deaths.records[0]!.velocityX).toBeCloseTo(100, 1);
  });
});
