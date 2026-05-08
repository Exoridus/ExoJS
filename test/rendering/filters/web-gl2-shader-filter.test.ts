/**
 * WebGl2ShaderFilter unit tests.
 *
 * These tests use a minimal WebGL2 mock (no real GPU) to verify the
 * WebGl2ShaderFilter's apply() flow, uniform marshalling, WebGPU guard, and
 * lifecycle methods without requiring a real WebGL2RenderingContext.
 */

import type { ShaderFilterUniformValue, WebGl2ShaderFilterOptions } from '@/rendering/filters/WebGl2ShaderFilter';
import { WebGl2ShaderFilter } from '@/rendering/filters/WebGl2ShaderFilter';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import { ShaderPrimitives } from '@/rendering/types';
import type { View } from '@/rendering/View';
import type { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';

// ---------------------------------------------------------------------------
// Minimal WebGL2 rendering context mock
// ---------------------------------------------------------------------------

function makeGlMock(): WebGL2RenderingContext {
  let programId = 1;
  let shaderId = 1;
  let bufferId = 1;
  let vaoId = 1;
  let uniformLocation = 1;

  return {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ACTIVE_ATTRIBUTES: 35721,
    ACTIVE_UNIFORMS: 35718,
    UNIFORM_BLOCK_INDEX: 35581,
    ACTIVE_UNIFORM_BLOCKS: 35382,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TRIANGLE_STRIP: 5,

    createProgram: jest.fn(() => ({ _id: programId++ })),
    createShader: jest.fn(() => ({ _id: shaderId++ })),
    createBuffer: jest.fn(() => ({ _id: bufferId++ })),
    createVertexArray: jest.fn(() => ({ _id: vaoId++ })),

    shaderSource: jest.fn(),
    compileShader: jest.fn(),
    attachShader: jest.fn(),
    linkProgram: jest.fn(),
    useProgram: jest.fn(),
    deleteShader: jest.fn(),
    deleteProgram: jest.fn(),
    deleteBuffer: jest.fn(),
    deleteVertexArray: jest.fn(),
    bindBuffer: jest.fn(),
    bufferData: jest.fn(),
    bindVertexArray: jest.fn(),
    vertexAttribPointer: jest.fn(),
    enableVertexAttribArray: jest.fn(),
    bindTexture: jest.fn(),
    activeTexture: jest.fn(),
    drawArrays: jest.fn(),

    uniform1f: jest.fn(),
    uniform2fv: jest.fn(),
    uniform3fv: jest.fn(),
    uniform4fv: jest.fn(),
    uniform1i: jest.fn(),
    uniform2iv: jest.fn(),
    uniform3iv: jest.fn(),
    uniform4iv: jest.fn(),
    uniformMatrix2fv: jest.fn(),
    uniformMatrix3fv: jest.fn(),
    uniformMatrix4fv: jest.fn(),

    getExtension: jest.fn(() => null),

    getShaderParameter: jest.fn(() => true),
    getProgramParameter: jest.fn((_, pname) => {
      if (pname === 35714) return true; // LINK_STATUS
      if (pname === 35721) return 2; // ACTIVE_ATTRIBUTES
      if (pname === 35718) return 0; // ACTIVE_UNIFORMS
      if (pname === 35382) return 0; // ACTIVE_UNIFORM_BLOCKS

      return true;
    }),
    getActiveAttrib: jest.fn((_, i) => {
      const attribs = [
        { name: 'aPosition', type: ShaderPrimitives.FloatVec2, size: 1 },
        { name: 'aUv', type: ShaderPrimitives.FloatVec2, size: 1 },
      ];

      return attribs[i] ?? null;
    }),
    getActiveUniform: jest.fn(() => null),
    getActiveUniforms: jest.fn(() => []),
    getActiveUniformBlockName: jest.fn(() => null),
    getUniformBlockIndex: jest.fn(() => 0),
    getShaderInfoLog: jest.fn(() => ''),
    getProgramInfoLog: jest.fn(() => ''),
    getAttribLocation: jest.fn((_prog, name) => {
      if (name === 'aPosition') return 0;
      if (name === 'aUv') return 1;

      return -1;
    }),
    getUniformLocation: jest.fn(() => ({ _id: uniformLocation++ })),
  } as unknown as WebGL2RenderingContext;
}

// ---------------------------------------------------------------------------
// Minimal backend mocks
// ---------------------------------------------------------------------------

interface MockBackendExtras {
  bindShader: jest.Mock;
  bindTexture: jest.Mock;
  bindVertexArrayObject: jest.Mock;
  execute: jest.Mock;
  gl: WebGL2RenderingContext;
}

function makeWebGl2Backend(glOverride?: WebGL2RenderingContext): RenderBackend & WebGl2Backend & MockBackendExtras {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();
  const gl = glOverride ?? makeGlMock();

  const bindShader = jest.fn();
  const bindTexture = jest.fn();
  const bindVertexArrayObject = jest.fn();
  const execute = jest.fn(pass => {
    pass.execute(backend);
    return backend;
  });

  const backend = {
    backendType: RenderBackendType.WebGl2,
    stats,
    context: gl,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);
      return this;
    },
    clear() {
      return this;
    },
    resize() {
      return this;
    },
    setView(view: View | null) {
      currentTarget.setView(view);
      return this;
    },
    setRenderTarget(target: RenderTarget | null) {
      currentTarget = target ?? root;

      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(w: number, h: number) {
      return new RenderTexture(w, h);
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
    bindShader,
    bindTexture,
    bindVertexArrayObject,
    execute,
  } as unknown as RenderBackend & WebGl2Backend & MockBackendExtras;

  return backend;
}

function makeWebGpuBackend(): RenderBackend {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();

  return {
    backendType: RenderBackendType.WebGpu,
    stats,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);
      return this;
    },
    clear() {
      return this;
    },
    resize() {
      return this;
    },
    setView(view: View | null) {
      currentTarget.setView(view);
      return this;
    },
    setRenderTarget(target: RenderTarget | null) {
      currentTarget = target ?? root;
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(w: number, h: number) {
      return new RenderTexture(w, h);
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
      return this;
    },
    execute(pass: { execute(b: RenderBackend): void }) {
      pass.execute(this as unknown as RenderBackend);
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
  } as unknown as RenderBackend;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const minimalFragSrc = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = texture(uTexture, vUv); }
`;

const customVertSrc = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() { vUv = aUv; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGl2ShaderFilter', () => {
  // 1. Construction with fragmentSource only — succeeds
  test('constructs successfully with only fragmentSource', () => {
    expect(() => new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc })).not.toThrow();
  });

  // 2. Construction without fragmentSource — throws
  test('throws when constructed without fragmentSource', () => {
    expect(() => new WebGl2ShaderFilter({} as WebGl2ShaderFilterOptions)).toThrow('WebGl2ShaderFilter requires fragmentSource for the WebGL2 backend.');
  });

  // 3. Default vertex shader is used when none provided
  test('uses default vertex shader when vertexSource is omitted', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });

    // Access private field via bracket notation for inspection
    expect((filter as unknown as Record<string, unknown>)['_vertexSource']).toContain('gl_Position');
    expect((filter as unknown as Record<string, unknown>)['_vertexSource']).toContain('aPosition');
    expect((filter as unknown as Record<string, unknown>)['_vertexSource']).toContain('aUv');

    filter.destroy();
  });

  // 4. Custom vertex shader is used when provided
  test('uses provided vertexSource when specified', () => {
    const filter = new WebGl2ShaderFilter({
      fragmentSource: minimalFragSrc,
      vertexSource: customVertSrc,
    });

    expect((filter as unknown as Record<string, unknown>)['_vertexSource']).toBe(customVertSrc);

    filter.destroy();
  });

  // 5. uniforms map is mutable
  test('uniforms map allows runtime mutation via property assignment', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });

    filter.uniforms['uTime'] = 1.234;
    filter.uniforms['uColor'] = [1, 0.5, 0, 1] as unknown as readonly [number, number, number, number];

    expect(filter.uniforms['uTime']).toBe(1.234);
    expect(filter.uniforms['uColor']).toEqual([1, 0.5, 0, 1]);

    filter.destroy();
  });

  // 6. Initial uniforms from constructor options populate the map
  test('constructor uniforms option populates the uniforms map', () => {
    const filter = new WebGl2ShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: {
        uTime: 0.5,
        uScale: [2, 2] as unknown as readonly [number, number],
      },
    });

    expect(filter.uniforms['uTime']).toBe(0.5);
    expect(filter.uniforms['uScale']).toEqual([2, 2]);

    filter.destroy();
  });

  // 7. apply() on WebGPU throws clearly with updated message
  test('apply() on WebGPU backend throws with clear error message', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const backend = makeWebGpuBackend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    expect(() => filter.apply(backend, input, output)).toThrow('WebGl2ShaderFilter requires the WebGL2 backend. Use WebGpuShaderFilter on WebGPU.');

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 8. apply() on WebGL2 backend calls backend.execute (RenderTargetPass)
  test('apply() on WebGL2 backend calls backend.execute with a RenderTargetPass', () => {
    const backend = makeWebGl2Backend();
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(64, 64);
    const output = new RenderTexture(64, 64);

    filter.apply(backend, input, output);

    expect(backend.execute).toHaveBeenCalledTimes(1);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 9. apply() binds input texture to slot 0
  test('apply() binds input texture to slot 0', () => {
    const backend = makeWebGl2Backend();
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    // bindTexture(input, 0) should have been called
    const calls: unknown[][] = backend.bindTexture.mock.calls;
    const slot0Call = calls.find(args => args[0] === input && args[1] === 0);

    expect(slot0Call).toBeDefined();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 10. Texture uniform binds to slot >= 1, sampler uniform = slot index
  test('texture uniforms in user map bind to slots starting at 1', () => {
    // Build a mock gl that reports one sampler2D uniform
    const gl = makeGlMock();
    const samplerUniform = { name: 'uExtraTex', type: ShaderPrimitives.Sampler2D, size: 1 };

    (gl.getProgramParameter as jest.Mock).mockImplementation((_prog: unknown, pname: number) => {
      if (pname === 35714) return true; // LINK_STATUS
      if (pname === 35721) return 2; // ACTIVE_ATTRIBUTES
      if (pname === 35718) return 1; // ACTIVE_UNIFORMS (1 sampler)
      if (pname === 35382) return 0; // ACTIVE_UNIFORM_BLOCKS

      return true;
    });
    (gl.getActiveUniform as jest.Mock).mockReturnValue(samplerUniform);
    (gl.getActiveUniforms as jest.Mock).mockReturnValue([-1]);

    const backend = makeWebGl2Backend(gl);

    // Create a canvas-backed texture so Texture is usable
    const canvas = document.createElement('canvas');

    canvas.width = 8;
    canvas.height = 8;
    const extraTex = new Texture(canvas);

    const filter = new WebGl2ShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: { uExtraTex: extraTex },
    });

    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    // uExtraTex should have been bound to slot 1 (slot 0 is reserved for uTexture)
    const calls: unknown[][] = backend.bindTexture.mock.calls;
    const slot1Call = calls.find(args => args[0] === extraTex && args[1] === 1);

    expect(slot1Call).toBeDefined();

    filter.destroy();
    input.destroy();
    output.destroy();
    extraTex.destroy();
  });

  // 11. Number -> Float32Array marshalling
  test('marshals number uniform value to Float32Array([n])', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const marshal = (filter as unknown as Record<string, (v: ShaderFilterUniformValue) => unknown>)['_marshalValue'].bind(filter);

    const result = marshal(3.14) as Float32Array;

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(1);
    expect(result[0]).toBeCloseTo(3.14);

    filter.destroy();
  });

  // 12. Tuple -> Float32Array marshalling
  test('marshals 2-tuple to Float32Array([a, b])', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const marshal = (filter as unknown as Record<string, (v: ShaderFilterUniformValue) => unknown>)['_marshalValue'].bind(filter);

    const result = marshal([0.5, 1.0] as unknown as readonly [number, number]) as Float32Array;

    expect(result).toBeInstanceOf(Float32Array);
    expect(Array.from(result)).toEqual([0.5, 1.0]);

    filter.destroy();
  });

  test('marshals 4-tuple to Float32Array of length 4', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const marshal = (filter as unknown as Record<string, (v: ShaderFilterUniformValue) => unknown>)['_marshalValue'].bind(filter);

    const result = marshal([1, 0, 0.5, 0.75] as unknown as readonly [number, number, number, number]) as Float32Array;

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);

    filter.destroy();
  });

  // 13. Float32Array pass-through
  test('passes through Float32Array without re-allocation', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const marshal = (filter as unknown as Record<string, (v: ShaderFilterUniformValue) => unknown>)['_marshalValue'].bind(filter);
    const arr = new Float32Array([1, 2, 3, 4]);

    expect(marshal(arr)).toBe(arr);

    filter.destroy();
  });

  // 14. Int32Array pass-through
  test('passes through Int32Array without re-allocation', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const marshal = (filter as unknown as Record<string, (v: ShaderFilterUniformValue) => unknown>)['_marshalValue'].bind(filter);
    const arr = new Int32Array([7, 8]);

    expect(marshal(arr)).toBe(arr);

    filter.destroy();
  });

  // 15. destroy() releases shader and clears uniforms
  test('destroy() clears the uniforms map and nulls internal resources', () => {
    const filter = new WebGl2ShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: { uTime: 1.0 },
    });

    filter.destroy();

    expect(Object.keys(filter.uniforms)).toHaveLength(0);
    expect((filter as unknown as Record<string, unknown>)['_shader']).toBeNull();
    expect((filter as unknown as Record<string, unknown>)['_connection']).toBeNull();
  });

  // 16. destroy() after apply() also disconnects GPU resources
  test('destroy() after apply() releases GPU resources', () => {
    const backend = makeWebGl2Backend();
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    // At this point shader is initialized
    expect((filter as unknown as Record<string, unknown>)['_shader']).not.toBeNull();

    filter.destroy();

    expect((filter as unknown as Record<string, unknown>)['_shader']).toBeNull();
    expect((filter as unknown as Record<string, unknown>)['_connection']).toBeNull();

    input.destroy();
    output.destroy();
  });

  // 17. Lazy init: _shader is null before first apply()
  test('shader is null before first apply() (lazy initialization)', () => {
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });

    expect((filter as unknown as Record<string, unknown>)['_shader']).toBeNull();

    filter.destroy();
  });

  // 18. _ensureConnected is idempotent — second apply() does not re-compile
  test('second apply() reuses the already-compiled shader', () => {
    const backend = makeWebGl2Backend();
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);
    const shaderAfterFirst = (filter as unknown as Record<string, unknown>)['_shader'];

    filter.apply(backend, input, output);
    const shaderAfterSecond = (filter as unknown as Record<string, unknown>)['_shader'];

    expect(shaderAfterFirst).toBe(shaderAfterSecond);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 19. bindShader is called with the compiled shader during apply()
  test('apply() calls bindShader with the internal Shader instance', () => {
    const backend = makeWebGl2Backend();
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    const internalShader = (filter as unknown as Record<string, unknown>)['_shader'];

    expect(backend.bindShader).toHaveBeenCalledWith(internalShader);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 20. apply() passes output as the RenderTargetPass target
  test('apply() renders into the output RenderTexture (RenderTargetPass target = output)', () => {
    const backend = makeWebGl2Backend();
    const filter = new WebGl2ShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(32, 32);

    // Capture the FIRST setRenderTarget call — RenderTargetPass calls:
    //   1. setRenderTarget(output)   ← the one we want to verify
    //   2. setRenderTarget(previousTarget) after the callback
    const capturedTargets: (RenderTarget | null)[] = [];

    backend.execute.mockImplementation(pass => {
      const spy = jest.spyOn(backend as unknown as RenderBackend, 'setRenderTarget').mockImplementation(target => {
        capturedTargets.push(target);

        return backend as unknown as RenderBackend;
      });

      pass.execute(backend);
      spy.mockRestore();

      return backend;
    });

    filter.apply(backend, input, output);

    // First setRenderTarget call must have been called with output
    expect(capturedTargets[0]).toBe(output);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 21. Default behavior: legacy gl_FragColor source is auto-upgraded (autoUpgrade default = true)
  test('default autoUpgrade upgrades legacy gl_FragColor source', () => {
    const legacyFrag = `void main() { gl_FragColor = vec4(1.0); }`;
    const filter = new WebGl2ShaderFilter({ fragmentSource: legacyFrag });
    const stored = (filter as unknown as Record<string, unknown>)['_fragmentSource'] as string;

    expect(stored).toMatch(/^#version 300 es/);
    expect(stored).toContain('fragColor');
    expect(stored).not.toContain('gl_FragColor');

    filter.destroy();
  });

  // 22. autoUpgrade: false skips the transform
  test('autoUpgrade: false leaves fragment source unchanged', () => {
    const legacyFrag = `void main() { gl_FragColor = vec4(1.0); }`;
    const filter = new WebGl2ShaderFilter({ fragmentSource: legacyFrag, autoUpgrade: false });
    const stored = (filter as unknown as Record<string, unknown>)['_fragmentSource'] as string;

    expect(stored).toBe(legacyFrag);

    filter.destroy();
  });
});
