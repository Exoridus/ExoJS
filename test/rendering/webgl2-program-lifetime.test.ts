import { describe, expect, test, vi } from 'vitest';

import type { Application } from '#core/Application';
import { createWebGl2ShaderProgram } from '#rendering/webgl2/shaderProgram';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2Shader } from '#rendering/webgl2/WebGl2Shader';

import { createFakeCanvas, createFakeWebGl2Context, GlEventLog, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

const createHarness = () => {
  installFakeWebGl2Globals();

  const recorder = new GlRecorder();
  const log = new GlEventLog();

  recorder.log = log;

  const gl = createFakeWebGl2Context(recorder);
  const app = {
    canvas: createFakeCanvas(4, 4, gl),
    options: { canvas: { width: 4, height: 4 }, rendering: { debug: false } },
  } as unknown as Application;
  const backend = new WebGl2Backend(app);
  const createShader = () => new WebGl2Shader('void main() {}', 'void main() {}').connect(createWebGl2ShaderProgram(gl));

  log.reset();

  return { gl, log, backend, createShader };
};

describe('WebGL2 program ownership', () => {
  test('destroy unbinds the actual current program before releasing it, including a program bound by sync', () => {
    const { gl, log, backend, createShader } = createHarness();
    const shader = createShader();

    shader.sync();

    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;

    log.reset();
    shader.destroy();

    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBeNull();
    expect(log.events.filter(event => event.op === 'useProgram' || event.op === 'delete:program')).toEqual([
      { op: 'useProgram', handle: null },
      { op: 'delete:program', handle: program },
    ]);
    backend.destroy();
  });

  test('destroying an inactive program preserves a different current program', () => {
    const { gl, log, backend, createShader } = createHarness();
    const inactive = createShader();
    const active = createShader();

    inactive.bind();
    active.sync();

    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;

    log.reset();
    inactive.destroy();

    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
    expect(log.events.filter(event => event.op === 'useProgram')).toEqual([]);
    active.destroy();
    backend.destroy();
  });

  test('repeated disconnect and destroy release each owned object once', () => {
    const { gl, log, backend, createShader } = createHarness();
    const shader = createShader();

    shader.bind();
    shader.disconnect();
    shader.disconnect();
    shader.destroy();

    expect(log.deleted('program')).toEqual(log.created('program'));
    expect(log.deleted('shader')).toEqual(log.created('shader'));
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBeNull();
    backend.destroy();
  });

  test('reconnecting a shader releases its previous program instead of orphaning it', () => {
    const { gl, log, backend, createShader } = createHarness();
    const shader = createShader();

    shader.bind();
    shader.connect(createWebGl2ShaderProgram(gl));
    shader.bind();
    shader.destroy();

    expect(log.deleted('program')).toEqual(log.created('program'));
    expect(log.deleted('shader')).toEqual(log.created('shader'));
    backend.destroy();
  });

  test('connecting the same runtime again preserves the live program', () => {
    const { gl, log, backend } = createHarness();
    const shader = new WebGl2Shader('void main() {}', 'void main() {}');
    const runtime = createWebGl2ShaderProgram(gl);

    shader.connect(runtime).bind();

    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;

    shader.connect(runtime).bind();
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
    expect(log.created('program')).toHaveLength(1);
    expect(log.deleted('program')).toEqual([]);
    shader.destroy();
    backend.destroy();
  });

  test('an initialization failure releases partially created shaders and permits reconnect', () => {
    const { gl, log, backend } = createHarness();
    const shader = new WebGl2Shader('void main() {}', 'void main() {}');
    const allocate = gl.createShader.bind(gl);
    const allocation = vi.spyOn(gl, 'createShader').mockImplementation(type => (type === gl.FRAGMENT_SHADER ? null : allocate(type)));

    expect(() => shader.connect(createWebGl2ShaderProgram(gl))).toThrow('Could not create shader.');
    expect(log.deleted('shader')).toEqual(log.created('shader'));
    expect(log.leaked('program')).toEqual([]);
    allocation.mockRestore();

    shader.connect(createWebGl2ShaderProgram(gl)).bind();
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).not.toBeNull();
    shader.destroy();
    expect(log.deleted('shader')).toEqual(log.created('shader'));
    expect(log.deleted('program')).toEqual(log.created('program'));
    backend.destroy();
  });

  test.each([false, true])('a cached shader descriptor rebinds after reconnect (reuse runtime: %s)', reuseRuntime => {
    const { gl, backend } = createHarness();
    const shader = new WebGl2Shader('void main() {}', 'void main() {}');
    const runtime = createWebGl2ShaderProgram(gl);

    shader.connect(runtime);
    backend.bindShader(shader);

    const first = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;

    shader.disconnect();
    shader.connect(reuseRuntime ? runtime : createWebGl2ShaderProgram(gl));
    backend.bindShader(shader);

    const replacement = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;

    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(first);
    shader.destroy();
    backend.destroy();
  });

  test('steady shader syncs perform no state queries or resource allocation', () => {
    const { gl, log, backend, createShader } = createHarness();
    const shader = createShader();

    shader.bind();
    log.reset();

    const query = vi.spyOn(gl, 'getParameter');

    for (let index = 0; index < 10; index++) {
      shader.sync();
    }

    expect(query).not.toHaveBeenCalled();
    expect(log.created('program')).toEqual([]);
    expect(log.created('shader')).toEqual([]);
    expect(log.events.filter(event => event.op === 'useProgram')).toHaveLength(10);
    query.mockRestore();
    shader.destroy();
    backend.destroy();
  });
});
