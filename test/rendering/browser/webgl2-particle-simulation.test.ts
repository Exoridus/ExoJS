import { type Application, Color, Rectangle, Texture, Time } from '@codexo/exojs';
import {
  DeathModule,
  type GlslContribution,
  type ParticleBatch,
  type ParticleDeathContext,
  particlesExtension,
  ParticleSystem,
  UpdateModule,
} from '@codexo/exojs-particles';

import { materializeRendererBindings } from '#extensions/materialize';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { ParticleGlState } from '../../../packages/exojs-particles/src/gpu/ParticleGlState';
import { wireCoreRenderers } from './_coreRenderers';

class TerminalModule extends UpdateModule {
  public override apply(_particles: ParticleBatch, _dt: number): void {}

  public override glsl(): GlslContribution {
    return {
      key: 'Terminal',
      body: 'velocity += vec2(8.0, -4.0) * dt; scale = vec2(timing.x / timing.y, 2.0 * timing.x / timing.y); color = 0x80402010u;',
    };
  }
}

const setup = (modules: UpdateModule[] = [], deaths = false) => {
  const gl = document.createElement('canvas').getContext('webgl2')!;
  const source = document.createElement('canvas');

  source.width = 4;
  source.height = 4;

  const texture = new Texture(source);
  const system = new ParticleSystem(texture, { capacity: 4 });
  const state = new ParticleGlState(gl, 4, modules, [], texture, new Rectangle(0, 0, 4, 4), deaths);

  return { gl, system, state, texture };
};

describe('WebGL2 transform feedback particle simulation', () => {
  it('isolates texture upload from caller unpack buffers and pixel stores', () => {
    const { gl, system, state, texture } = setup();
    const unpack = gl.createBuffer();

    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpack);
    gl.bufferData(gl.PIXEL_UNPACK_BUFFER, 4096, gl.STATIC_DRAW);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 32);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 2);
    state.refreshFrames([], texture, new Rectangle(1, 1, 2, 2));
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING)).toBe(unpack);
    expect(gl.getParameter(gl.UNPACK_ROW_LENGTH)).toBe(32);
    expect(gl.getParameter(gl.UNPACK_SKIP_PIXELS)).toBe(2);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.deleteBuffer(unpack);
    state.destroy();
    system.destroy();
    texture.destroy();
  });

  it('integrates ping-pong buffers and preserves live GL bindings', () => {
    const { gl, system, state, texture } = setup();
    const particle = system.emit()!;

    particle.position.set(3, 5);
    particle.velocity.set(8, -4);
    particle.lifetime = 2;

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    const feedback = gl.createTransformFeedback();
    const sampler = gl.createSampler();
    const boundTexture = gl.createTexture();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    gl.bindSampler(0, sampler);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, boundTexture);
    gl.activeTexture(gl.TEXTURE3);
    state.uploadDirty(system, [0]);
    const initial = state.instanceBuffer;
    const readback = vi.spyOn(gl, 'getBufferSubData');

    state.dispatch(0.25, 1, 0);
    expect(readback).not.toHaveBeenCalled();
    readback.mockRestore();
    expect(state.instanceBuffer).not.toBe(initial);
    expect(gl.getParameter(gl.VERTEX_ARRAY_BINDING)).toBe(vao);
    expect(gl.getParameter(gl.ARRAY_BUFFER_BINDING)).toBe(buffer);
    expect(gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING)).toBe(feedback);
    expect(gl.isEnabled(gl.RASTERIZER_DISCARD)).toBe(false);
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(gl.TEXTURE3);
    gl.activeTexture(gl.TEXTURE0);
    expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(boundTexture);
    expect(gl.getParameter(gl.SAMPLER_BINDING)).toBe(sampler);
    state.dispatch(0.25, 1, 0);

    const values = new Float32Array(20);

    gl.bindBuffer(gl.COPY_READ_BUFFER, state.instanceBuffer);
    gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, values);
    expect(values[0]).toBe(7);
    expect(values[1]).toBe(3);
    expect(values[13]).toBe(0.5);
    expect(gl.getError()).toBe(gl.NO_ERROR);

    state.destroy();
    state.destroy();
    expect(gl.isBuffer(initial)).toBe(false);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTransformFeedback(feedback);
    gl.deleteSampler(sampler);
    gl.deleteTexture(boundTexture);
    system.destroy();
    texture.destroy();
  });

  it('captures terminal module state with the original lifetime exactly once', async () => {
    const { gl, system, state, texture } = setup([new TerminalModule()], true);
    const particle = system.emit()!;

    particle.position.set(3, 5);
    particle.velocity.set(8, -4);
    particle.lifetime = 0.5;
    state.uploadDirty(system, [0]);
    state.dispatch(0.25, 1, 0);
    state.uploadExpiry(0);
    state.dispatch(0.25, 1, 1);

    const records: unknown[] = [];

    await state.readDeaths(batch => records.push(...batch));
    expect(records).toEqual([{ x: 7.5, y: 2.75, velocityX: 12, velocityY: -6, rotation: 0, scaleX: 1, scaleY: 2, elapsed: 0.5, color: 0x80402010, slot: 0 }]);
    state.dispatch(0.25, 1, 0);
    await state.readDeaths(batch => records.push(...batch));
    expect(records).toHaveLength(1);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    state.destroy();
    system.destroy();
    texture.destroy();
  });

  it('keeps simulating when staging is full and reports only staged batches', async () => {
    const { gl, system, state, texture } = setup([], true);
    const particle = system.emit()!;

    particle.velocity.set(4, 0);
    particle.lifetime = 0.25;
    for (let i = 0; i < 5; i++) {
      particle.position.set(i * 10, 0);
      state.uploadDirty(system, [0]);
      state.uploadExpiry(0);
      expect(state.dispatch(0.25, 1, 1)).toBe(i < 3);
    }

    const positions: number[] = [];
    const receive = (records: ReadonlyArray<{ x: number }>) => {
      positions.push(...records.map(record => record.x));
    };

    await Promise.all([state.readDeaths(receive), state.readDeaths(receive), state.readDeaths(receive)]);
    expect(positions).toEqual([1, 11, 21]);
    expect(state.dispatch(0, 0, 2)).toBe(true);
    await state.readDeaths(receive);
    expect(positions).toEqual([1, 11, 21, 31, 41]);
    expect(state.dispatch(0, 0, 0)).toBe(false);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    state.destroy();
    system.destroy();
    texture.destroy();
  });

  it('integrates particles expiring in their zero-lifetime spawn step', async () => {
    const { gl, system, state, texture } = setup([], true);
    const particle = system.emit()!;

    particle.position.set(3, 5);
    particle.velocity.set(8, -4);
    particle.lifetime = 0;
    state.uploadDirty(system, [0]);
    state.uploadExpiry(0);
    expect(state.dispatch(0.25, 1, 1)).toBe(true);
    const records: unknown[] = [];

    await state.readDeaths(batch => records.push(...batch));
    expect(records).toEqual([{ x: 5, y: 4, velocityX: 8, velocityY: -4, rotation: 0, scaleX: 1, scaleY: 1, elapsed: 0.25, color: 0xffffffff, slot: 0 }]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    state.destroy();
    system.destroy();
    texture.destroy();
  });

  it('preserves original lifetimes through system slot reuse and staging backpressure', async () => {
    const canvas = document.createElement('canvas');
    const backend = new WebGl2Backend({ canvas, options: { canvas: { width: 64, height: 64 }, clearColor: Color.black } } as unknown as Application);

    await backend.initialize();
    wireCoreRenderers(backend);
    materializeRendererBindings(backend, particlesExtension.renderers!);
    const system = new ParticleSystem({ capacity: 4 });
    const deaths: ParticleDeathContext[] = [];

    class Recorder extends DeathModule {
      public override onDeath(_system: ParticleSystem, context: ParticleDeathContext): void {
        deaths.push(context);
      }
    }

    system.addDeathModule(new Recorder());
    system.render(backend);
    backend.flush();
    system.update(Time.seconds(0));
    expect(system.simulationBackend).toBe('webgl2');

    for (let i = 0; i < 6; i++) {
      const particle = system.emit()!;

      particle.lifetime = (i + 1) / 8;
      particle.position.set(i * 10, 0);
      particle.velocity.set(4, 0);
      system.update(Time.seconds(1));
    }

    const deadline = performance.now() + 3000;

    while (deaths.length < 6 && performance.now() < deadline) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 4);
      });
      system.update(Time.seconds(0));
    }
    expect(deaths.map(death => death.x)).toEqual([4, 14, 24, 34, 44, 54]);
    expect(deaths.map(death => death.lifetime)).toEqual([0.125, 0.25, 0.375, 0.5, 0.625, 0.75]);
    system.destroy();
    backend.destroy();
  });

  it('releases queued readbacks safely when destroyed before delivery', async () => {
    const { gl, system, state, texture } = setup([], true);
    const particle = system.emit()!;

    particle.lifetime = 0.25;
    state.uploadDirty(system, [0]);
    state.uploadExpiry(0);
    state.dispatch(0.25, 1, 1);
    const buffer = state.instanceBuffer;
    const receive = vi.fn();
    const destroyed = vi.fn();
    const pending = state.readDeaths(receive);

    state.onDestroy = destroyed;
    state.destroy();
    state.destroy();
    await pending;
    expect(receive).not.toHaveBeenCalled();
    expect(destroyed).toHaveBeenCalledOnce();
    expect(gl.isBuffer(buffer)).toBe(false);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    system.destroy();
    texture.destroy();
  });

  it('releases all allocated buffers after shader compilation fails', () => {
    const { gl, system, state, texture } = setup();
    const createBuffer = gl.createBuffer.bind(gl);
    const buffers: WebGLBuffer[] = [];
    const spy = vi.spyOn(gl, 'createBuffer').mockImplementation(() => {
      const buffer = createBuffer();

      if (buffer) buffers.push(buffer);
      return buffer;
    });
    class InvalidModule extends UpdateModule {
      public override apply(_particles: ParticleBatch, _dt: number): void {}
      public override glsl(): GlslContribution {
        return { key: 'Invalid', body: 'invalid syntax;' };
      }
    }

    expect(() => new ParticleGlState(gl, 4, [new InvalidModule()], [], texture, new Rectangle(0, 0, 4, 4))).toThrow('Particle transform feedback shader');
    expect(buffers).toHaveLength(2);
    expect(buffers.every(buffer => !gl.isBuffer(buffer))).toBe(true);
    spy.mockRestore();
    expect(gl.getError()).toBe(gl.NO_ERROR);
    state.destroy();
    system.destroy();
    texture.destroy();
  });
});
