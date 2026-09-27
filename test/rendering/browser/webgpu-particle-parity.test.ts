import { Rectangle, Texture, Time } from '@codexo/exojs';
import { DeathModule, type ParticleDeathContext, particlesExtension, ParticleSystem } from '@codexo/exojs-particles';

import { materializeRendererBindings } from '#extensions/materialize';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGl2TestBackend, createWebGpuTestBackend, readWebGl2Pixel, readWebGpuPixels, renderWebGl2Once, renderWebGpuOnce } from './_backendSetup';
import { particleParityFixtures, seedParticleParity } from './_particleParity';
import { expectPixelNear } from './_pixels';

class RecordDeaths extends DeathModule {
  public readonly records: ParticleDeathContext[] = [];

  public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
    this.records.push(death);
  }
}

const compareColor = (actual: number, expected: number): void => {
  // Float32 interpolation can cross a nearest-byte boundary; one byte is the bound.
  for (const shift of [0, 8, 16, 24]) {
    expect(Math.abs(((actual >>> shift) & 255) - ((expected >>> shift) & 255))).toBeLessThanOrEqual(1);
  }
};

const compareState = (actual: ParticleDeathContext, expected: ParticleDeathContext): void => {
  // Three 1/16 s steps keep Float32 accumulation below 1e-4 scene units for these fixtures.
  for (const field of ['x', 'y', 'velocityX', 'velocityY', 'rotation', 'scaleX', 'scaleY', 'elapsed', 'lifetime'] as const) {
    expect(Math.abs(actual[field] - expected[field])).toBeLessThanOrEqual(1e-4);
  }
  compareColor(actual.color, expected.color);
};

const readGpuInstances = async (backend: WebGpuBackend, system: ParticleSystem): Promise<ArrayBuffer> => {
  const staging = backend.device.createBuffer({ size: 120, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

  try {
    const encoder = backend.device.createCommandEncoder();

    encoder.copyBufferToBuffer(system.gpuState!.instanceBuffer, 0, staging, 0, 120);
    backend.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    return staging.getMappedRange().slice(0);
  } finally {
    staging.destroy();
  }
};

const compareInstances = (bytes: ArrayBuffer, stride: number, cpu: ParticleSystem): void => {
  const floats = new Float32Array(bytes);
  const uints = new Uint32Array(bytes);

  for (let i = 0; i < 3; i++) {
    const expected = cpu._storage.snapshot(i);
    const base = i * stride;

    for (const [offset, field] of [
      [0, 'x'],
      [1, 'y'],
      [2, 'scaleX'],
      [3, 'scaleY'],
      [4, 'rotation'],
    ] as const) {
      expect(Math.abs(floats[base + offset]! - expected[field])).toBeLessThanOrEqual(1e-4);
    }
    compareColor(uints[base + 5]!, expected.color);
  }
};

describe('particle CPU/WebGL2/WebGPU simulation parity', () => {
  let webgl: WebGl2Backend;
  let webgpu: WebGpuBackend;

  beforeAll(async () => {
    webgl = await createWebGl2TestBackend(64);
    webgpu = await createWebGpuTestBackend(64);
    materializeRendererBindings(webgl, particlesExtension.renderers!);
    materializeRendererBindings(webgpu, particlesExtension.renderers!);
  });

  afterAll(() => {
    webgl?.destroy();
    webgpu?.destroy();
  });

  test('CPU, transform feedback and compute render atlas frames, transforms and expired holes alike', async context => {
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 4;
    const painter = source.getContext('2d')!;
    painter.fillStyle = '#ff0000';
    painter.fillRect(0, 0, 4, 4);
    painter.fillStyle = '#0000ff';
    painter.fillRect(4, 0, 4, 4);
    const texture = new Texture(source);
    const frames = [new Rectangle(0, 0, 4, 4), new Rectangle(4, 0, 4, 4)];
    const cpu = new ParticleSystem(texture, frames, { capacity: 3, simulation: 'cpu' });
    const gl = new ParticleSystem(texture, frames, { capacity: 3 });
    const gpu = new ParticleSystem(texture, frames, { capacity: 3 });
    try {
      for (const system of [cpu, gl, gpu]) {
        system.setScale(2);
        const expired = system.emit()!;
        expired.position.set(24, 8);
        expired.lifetime = 0;
        const red = system.emit()!;
        red.position.set(8, 8);
        red.velocity.set(8, 0);
        red.color = 0x80ffffff;
        red.lifetime = 2;
        const blue = system.emit()!;
        blue.position.set(20, 20);
        blue.frame = 1;
        blue.rotation = 90;
        blue.lifetime = 2;
      }
      renderWebGl2Once(webgl, gl);
      await renderWebGpuOnce(context, webgpu, gpu);
      for (const system of [cpu, gl, gpu]) system.update(Time.seconds(0.5));
      const points = [
        [24, 16],
        [40, 40],
        [48, 16],
        [4, 4],
      ] as const;
      renderWebGl2Once(webgl, cpu);
      const expected = points.map(([x, y]) => readWebGl2Pixel(webgl, x, y));
      expectPixelNear(expected[0]!, [128, 0, 0, 255], 1);
      expectPixelNear(expected[1]!, [0, 0, 255, 255], 1);
      expectPixelNear(expected[2]!, [0, 0, 0, 255], 0);
      renderWebGl2Once(webgl, gl);
      for (let i = 0; i < points.length; i++) expectPixelNear(readWebGl2Pixel(webgl, ...points[i]!), expected[i]!, 1);
      await renderWebGpuOnce(context, webgpu, gpu);
      const pixel = readWebGpuPixels(webgpu, 64);
      for (let i = 0; i < points.length; i++) expectPixelNear(pixel(...points[i]!), expected[i]!, 1);
    } finally {
      cpu.destroy();
      gl.destroy();
      gpu.destroy();
      texture.destroy();
      for (const frame of frames) frame.destroy();
    }
  });

  test.each(particleParityFixtures)('$name matches live instances and terminal records', async fixture => {
    const source = document.createElement('canvas');

    source.width = 4;
    source.height = 4;
    source.getContext('2d')!.fillRect(0, 0, 4, 4);
    const texture = new Texture(source);
    const cpu = new ParticleSystem(texture, { capacity: 3, simulation: 'cpu' });
    const gl = new ParticleSystem(texture, { capacity: 3 });
    const gpu = new ParticleSystem(texture, { capacity: 3 });
    const systems = [cpu, gl, gpu];
    const captures = systems.map(() => new RecordDeaths());

    try {
      for (let i = 0; i < systems.length; i++) {
        const system = systems[i]!;

        for (const module of fixture.modules()) system.addUpdateModule(module);
        system.addDeathModule(captures[i]!);
      }
      gl.render(webgl);
      webgl.flush();
      gpu.render(webgpu);
      webgpu.flush();

      for (const system of systems) {
        system.update(Time.seconds(0.5));
        (fixture.seed ?? seedParticleParity)(system);
      }

      for (let frame = 0; frame < 3; frame++) {
        for (const system of systems) system.update(Time.seconds(1 / 16));
        expect(cpu.simulationBackend).toBe('cpu');
        expect(gl.simulationBackend).toBe('webgl2');
        expect(gpu.simulationBackend).toBe('webgpu');

        if (frame < 2) {
          compareInstances(await readGpuInstances(webgpu, gpu), 10, cpu);
          const state = gl.glState!;
          const bytes = new ArrayBuffer(state.instanceStride * 3);
          const previous = webgl.context.getParameter(webgl.context.COPY_READ_BUFFER_BINDING) as WebGLBuffer | null;

          webgl.context.bindBuffer(webgl.context.COPY_READ_BUFFER, state.instanceBuffer);
          webgl.context.getBufferSubData(webgl.context.COPY_READ_BUFFER, 0, new Uint8Array(bytes));
          webgl.context.bindBuffer(webgl.context.COPY_READ_BUFFER, previous);
          compareInstances(bytes, state.instanceStride / 4, cpu);
        }
      }

      const deadline = performance.now() + 6000;

      while (captures.some(capture => capture.records.length < 3) && performance.now() < deadline) {
        webgl.context.flush();
        await new Promise(resolve => setTimeout(resolve, 4));
      }
      for (const capture of captures) expect(capture.records).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        compareState(captures[1]!.records[i]!, captures[0]!.records[i]!);
        compareState(captures[2]!.records[i]!, captures[0]!.records[i]!);
      }
      expect(webgl.context.getError()).toBe(webgl.context.NO_ERROR);
    } finally {
      for (const system of systems) system.destroy();
      texture.destroy();
    }
  });
});
