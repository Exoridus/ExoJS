/**
 * A WebGL2 object that fails half-way through its set-up must leave nothing
 * behind and must be retryable: no GL object stays live, and the "already
 * built" guard is not tripped by a half-built state.
 */

import { describe, expect, test, vi } from 'vitest';

import { RenderBackendType } from '#rendering/RenderBackendType';
import { AbstractWebGl2Renderer } from '#rendering/webgl2/AbstractWebGl2Renderer';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2OutputPass } from '#rendering/webgl2/WebGl2OutputPass';
import { WebGl2StencilClipper } from '#rendering/webgl2/WebGl2StencilClipper';
import { WebGl2TextRenderer } from '#rendering/webgl2/WebGl2TextRenderer';
import { type WebGl2ColorNormalizationHost, WebGl2TextureNormalizer } from '#rendering/webgl2/WebGl2TextureNormalizer';
import { WebGl2VertexArrayObject } from '#rendering/webgl2/WebGl2VertexArrayObject';

import { createFakeWebGl2Context, GlEventLog, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

const createGl = (): { gl: WebGL2RenderingContext; log: GlEventLog } => {
  installFakeWebGl2Globals();

  const recorder = new GlRecorder();
  const log = new GlEventLog();

  recorder.log = log;

  return { gl: createFakeWebGl2Context(recorder), log };
};

const mutable = (gl: WebGL2RenderingContext): Record<string, unknown> => gl as unknown as Record<string, unknown>;

class ProbeRenderer extends AbstractWebGl2Renderer<never> {
  public connects = 0;
  public failConnect = false;
  public failFlush = false;
  public disconnects = 0;

  public render(): void {}

  public flush(): void {
    if (this.failFlush) {
      throw new Error('flush failed');
    }
  }

  protected onConnect(): void {
    this.connects++;

    if (this.failConnect) {
      throw new Error('connect failed');
    }
  }

  protected onDisconnect(): void {
    this.disconnects++;
  }
}

const fakeBackend = { backendType: RenderBackendType.WebGl2 } as unknown as WebGl2Backend;

describe('AbstractWebGl2Renderer lifecycle', () => {
  test('a throwing onConnect leaves the renderer disconnected so the next connect retries', () => {
    const renderer = new ProbeRenderer();

    renderer.failConnect = true;
    expect(() => renderer.connect(fakeBackend)).toThrow('connect failed');

    renderer.failConnect = false;
    renderer.connect(fakeBackend);

    expect(renderer.connects).toBe(2);
  });

  test('a throwing flush still runs onDisconnect and marks the renderer disconnected', () => {
    const renderer = new ProbeRenderer();

    renderer.connect(fakeBackend);
    renderer.failFlush = true;

    expect(() => renderer.disconnect()).toThrow('flush failed');
    expect(renderer.disconnects).toBe(1);

    renderer.failFlush = false;
    renderer.connect(fakeBackend);

    expect(renderer.connects).toBe(2);
  });
});

describe('WebGl2OutputPass', () => {
  test('a failed first present leaks no GL object and the retry builds exactly one set', () => {
    const { gl, log } = createGl();
    const original = gl.createVertexArray.bind(gl);
    let fail = true;

    mutable(gl)['createVertexArray'] = (): unknown => {
      if (fail) {
        fail = false;

        return null;
      }

      return original();
    };

    const backend = { context: gl, onContextLost: { add: (): void => {} } } as unknown as WebGl2Backend;
    const pass = new WebGl2OutputPass() as unknown as { _ensureConnected(backend: WebGl2Backend): void };

    expect(() => pass._ensureConnected(backend)).toThrow('vertex array');
    expect(log.leaked('program')).toHaveLength(0);

    pass._ensureConnected(backend);

    expect(log.leaked('program')).toHaveLength(1);
  });
});

describe('WebGl2StencilClipper.connect', () => {
  test('a failure after the VAO handle exists releases it and a retry succeeds', () => {
    const { gl, log } = createGl();
    const backend = { context: gl, accountant: null } as unknown as WebGl2Backend;
    const clipper = new WebGl2StencilClipper();
    const spy = vi.spyOn(WebGl2VertexArrayObject.prototype, 'addAttribute').mockImplementationOnce(() => {
      throw new Error('attribute failed');
    });

    expect(() => clipper.connect(backend)).toThrow('attribute failed');
    expect(log.leaked('vertexArray')).toHaveLength(0);
    expect(log.leaked('program')).toHaveLength(0);

    spy.mockRestore();
    clipper.connect(backend);

    expect(log.leaked('vertexArray')).toHaveLength(1);
  });
});

describe('WebGl2TextureNormalizer program build', () => {
  const host = {} as unknown as WebGl2ColorNormalizationHost;
  const build = (n: WebGl2TextureNormalizer): unknown => (n as unknown as { _ensureProgram(): unknown })._ensureProgram();

  test('a fragment compile failure deletes the already compiled vertex shader', () => {
    const { gl, log } = createGl();

    mutable(gl)['getShaderParameter'] = (shader: { glType: number }): boolean => shader.glType !== gl.FRAGMENT_SHADER;

    const normalizer = new WebGl2TextureNormalizer(gl, host);

    expect(() => build(normalizer)).toThrow('compile');
    expect(() => build(normalizer)).toThrow('compile');
    expect(log.leaked('shader')).toHaveLength(0);
  });

  test('a framebuffer failure leaves no published program and a retry rebuilds', () => {
    const { gl, log } = createGl();
    const original = gl.createFramebuffer.bind(gl);
    let fail = true;

    mutable(gl)['createFramebuffer'] = (): unknown => {
      if (fail) {
        fail = false;

        throw new Error('framebuffer failed');
      }

      return original();
    };

    const normalizer = new WebGl2TextureNormalizer(gl, host);

    expect(() => build(normalizer)).toThrow('framebuffer failed');
    expect(log.leaked('program')).toHaveLength(0);
    expect(log.leaked('buffer')).toHaveLength(0);

    expect(build(normalizer)).not.toBeNull();
    expect(log.leaked('program')).toHaveLength(1);
    expect(log.leaked('framebuffer')).toHaveLength(1);
  });
});

describe('WebGl2TextRenderer.flush', () => {
  test('a throwing draw does not leave the frame queued for the next flush', () => {
    const renderer = new WebGl2TextRenderer();
    const internals = renderer as unknown as {
      _connection: object | null;
      _pendingQuads: unknown[];
      _drawBatches(c: object): void;
      _uploadNodeData(c: object): void;
    };

    internals._connection = {};
    internals._pendingQuads.push({});
    vi.spyOn(internals, '_uploadNodeData').mockImplementation(() => {});
    vi.spyOn(internals, '_drawBatches').mockImplementation(() => {
      throw new Error('draw failed');
    });

    expect(() => renderer.flush()).toThrow('draw failed');
    expect(internals._pendingQuads).toHaveLength(0);
  });
});
