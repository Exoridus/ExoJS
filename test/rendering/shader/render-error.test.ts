/**
 * Render-fail surface (S3 diagnostics, minimal slice) — contracts 1, 2 and 8:
 *
 *  1. WebGL2 shader compile failure → RenderError with code 'shader-compile',
 *     message containing the shader label (or "shader"), detail containing the
 *     driver log and a `>`-marked excerpt line.
 *  2. WebGL2 link failure → code 'shader-link'.
 *  8. formatShaderError parses `ERROR: 0:<line>:` logs into a marked excerpt;
 *     unparseable logs are returned verbatim.
 */

import { RenderBackendType } from '#rendering/RenderBackendType';
import { formatShaderError, RenderError } from '#rendering/RenderError';
import { Shader } from '#rendering/shader/Shader';
import { createWebGl2ShaderProgram } from '#rendering/webgl2/WebGl2ShaderProgram';

interface MockGlOptions {
  /** Force COMPILE_STATUS false for this shader type (VERTEX_SHADER / FRAGMENT_SHADER). */
  failCompileStage?: number;
  /** Info log returned by getShaderInfoLog for the failing stage. */
  shaderInfoLog?: string;
  /** Force LINK_STATUS false. */
  failLink?: boolean;
  /** Info log returned by getProgramInfoLog when linking fails. */
  programInfoLog?: string;
}

const VERTEX_SHADER = 0x8b31;
const FRAGMENT_SHADER = 0x8b30;
const COMPILE_STATUS = 0x8b81;
const LINK_STATUS = 0x8b82;

/** Minimal WebGL2 mock covering the createWebGl2ShaderProgram surface. */
function createMockGl(options: MockGlOptions = {}): WebGL2RenderingContext {
  const shaderTypes = new Map<object, number>();

  const gl = {
    VERTEX_SHADER,
    FRAGMENT_SHADER,
    COMPILE_STATUS,
    LINK_STATUS,
    ACTIVE_ATTRIBUTES: 0x8b89,
    ACTIVE_UNIFORMS: 0x8b86,
    ACTIVE_UNIFORM_BLOCKS: 0x8a36,
    UNIFORM_BLOCK_INDEX: 0x8a3a,
    getExtension: vi.fn(() => null),
    createShader: vi.fn((type: number) => {
      const shader = { type };

      shaderTypes.set(shader, type);

      return shader as unknown as WebGLShader;
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    createProgram: vi.fn(() => ({}) as WebGLProgram),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getShaderParameter: vi.fn((shader: object, pname: number) => {
      if (pname === COMPILE_STATUS) {
        return shaderTypes.get(shader) !== options.failCompileStage;
      }

      return true;
    }),
    getShaderInfoLog: vi.fn(() => options.shaderInfoLog ?? null),
    getProgramParameter: vi.fn((_program: object, pname: number) => {
      if (pname === LINK_STATUS) {
        return options.failLink !== true;
      }

      // ACTIVE_ATTRIBUTES / ACTIVE_UNIFORMS / ACTIVE_UNIFORM_BLOCKS
      return 0;
    }),
    getProgramInfoLog: vi.fn(() => options.programInfoLog ?? null),
    getActiveUniforms: vi.fn(() => []),
    useProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
  };

  return gl as unknown as WebGL2RenderingContext;
}

const vertexSource = [
  '#version 300 es',
  'precision mediump float;',
  'in vec2 a_position;',
  'void main() {',
  '  gl_Position = vec4(a_position, 0.0, 1.0);',
  '}',
].join('\n');

const fragmentSource = ['#version 300 es', 'precision mediump float;', 'out vec4 fragColor;', 'void main() {', '  fragColor = vec4(1.0);', '}'].join('\n');

describe('WebGl2ShaderProgram — structured RenderError (contracts 1, 2)', () => {
  test('vertex compile failure throws RenderError with code shader-compile, label in message, marked excerpt in detail', () => {
    const gl = createMockGl({
      failCompileStage: VERTEX_SHADER,
      shaderInfoLog: "ERROR: 0:5: 'gl_Position' : syntax error",
    });
    const program = createWebGl2ShaderProgram(gl, 'test:sprite');
    const shader = new Shader(vertexSource, fragmentSource);

    let thrown: unknown = null;

    try {
      shader.connect(program);
      shader.bind();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RenderError);

    const renderError = thrown as RenderError;

    expect(renderError.code).toBe('shader-compile');
    expect(renderError.backendType).toBe(RenderBackendType.WebGl2);
    expect(renderError.message).toContain('test:sprite');
    expect(renderError.message.toLowerCase()).toContain('vertex');
    expect(renderError.resource).toBe('test:sprite');
    expect(renderError.detail).toContain("ERROR: 0:5: 'gl_Position' : syntax error");
    // Excerpt marks the failing source line with `>`.
    expect(renderError.detail).toMatch(/^> +5 \|/m);
  });

  test('fragment compile failure without a label still mentions "shader" in the message', () => {
    const gl = createMockGl({
      failCompileStage: FRAGMENT_SHADER,
      shaderInfoLog: 'ERROR: 0:4: syntax error',
    });
    const program = createWebGl2ShaderProgram(gl);
    const shader = new Shader(vertexSource, fragmentSource);

    let thrown: unknown = null;

    try {
      shader.connect(program);
      shader.bind();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RenderError);

    const renderError = thrown as RenderError;

    expect(renderError.code).toBe('shader-compile');
    expect(renderError.message.toLowerCase()).toContain('shader');
    expect(renderError.message.toLowerCase()).toContain('fragment');
    expect(renderError.resource).toBeNull();
  });

  test('link failure throws RenderError with code shader-link and the raw program log as detail', () => {
    const gl = createMockGl({
      failLink: true,
      programInfoLog: 'varying mismatch between stages',
    });
    const program = createWebGl2ShaderProgram(gl, 'test:mesh');
    const shader = new Shader(vertexSource, fragmentSource);

    let thrown: unknown = null;

    try {
      shader.connect(program);
      shader.bind();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RenderError);

    const renderError = thrown as RenderError;

    expect(renderError.code).toBe('shader-link');
    expect(renderError.backendType).toBe(RenderBackendType.WebGl2);
    expect(renderError.detail).toContain('varying mismatch between stages');
  });

  test('a healthy program compiles, links and binds without throwing', () => {
    const gl = createMockGl();
    const program = createWebGl2ShaderProgram(gl, 'test:ok');
    const shader = new Shader(vertexSource, fragmentSource);

    expect(() => {
      shader.connect(program);
      shader.bind();
    }).not.toThrow();
  });
});

describe('formatShaderError (contract 8)', () => {
  const source = Array.from({ length: 20 }, (_, i) => `line ${i + 1} of source`).join('\n');

  test('parses `ERROR: 0:12:` into an excerpt with line 12 marked', () => {
    const formatted = formatShaderError(source, "ERROR: 0:12: 'foo' : syntax error");

    expect(formatted).toContain("ERROR: 0:12: 'foo' : syntax error");
    expect(formatted).toMatch(/^> +12 \| line 12 of source$/m);
    // Context lines around the failing line, unmarked.
    expect(formatted).toMatch(/^ {2}10 \| line 10 of source$/m);
    expect(formatted).toMatch(/^ {2}14 \| line 14 of source$/m);
  });

  test('parses WGSL-style `:3:8` positions', () => {
    const formatted = formatShaderError(source, ':3:8 unresolved identifier');

    expect(formatted).toMatch(/^> +3 \| line 3 of source$/m);
  });

  test('marks multiple referenced lines', () => {
    const formatted = formatShaderError(source, 'ERROR: 0:2: bad token\nERROR: 0:9: undeclared identifier');

    expect(formatted).toMatch(/^> +2 \| line 2 of source$/m);
    expect(formatted).toMatch(/^> +9 \| line 9 of source$/m);
  });

  test('unparseable log is returned verbatim', () => {
    const log = 'internal driver failure, no location info';

    expect(formatShaderError(source, log)).toBe(log);
  });

  test('line reference outside the source falls back to the raw log', () => {
    const log = 'ERROR: 0:999: out of range';

    expect(formatShaderError(source, log)).toBe(log);
  });
});
