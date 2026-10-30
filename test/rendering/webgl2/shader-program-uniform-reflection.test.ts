/**
 * Uniform reflection indexes every active uniform of a linked program, however
 * many the program declares.
 */

import { describe, expect, test } from 'vitest';

import { createWebGl2ShaderProgram } from '#rendering/webgl2/shaderProgram';
import { WebGl2Shader } from '#rendering/webgl2/WebGl2Shader';

const FLOAT = 0x1406;
const ACTIVE_UNIFORMS = 0x8b86;
const LINK_STATUS = 0x8b82;

const createStubContext = (uniformCount: number): { gl: WebGL2RenderingContext; queried: number[] } => {
  const queried: number[] = [];
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS,
    ACTIVE_ATTRIBUTES: 0x8b89,
    ACTIVE_UNIFORMS,
    ACTIVE_UNIFORM_BLOCKS: 0x8a36,
    UNIFORM_BLOCK_INDEX: 0x8a3a,
    createShader: () => ({}) as WebGLShader,
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: () => ({}) as WebGLProgram,
    attachShader: () => {},
    linkProgram: () => {},
    useProgram: () => {},
    deleteShader: () => {},
    deleteProgram: () => {},
    getExtension: () => null,
    getShaderParameter: () => true,
    getProgramParameter: (_program: WebGLProgram, name: number) => (name === ACTIVE_UNIFORMS ? uniformCount : name === LINK_STATUS),
    getActiveUniforms: (_program: WebGLProgram, indices: ArrayLike<number>) => {
      queried.push(...Array.from(indices));

      return Array.from(indices, () => -1);
    },
    getActiveUniform: (_program: WebGLProgram, index: number) => ({ name: `u${index}`, type: FLOAT, size: 1 }),
    getUniformLocation: () => ({}) as WebGLUniformLocation,
    uniform1f: () => {},
  } as unknown as WebGL2RenderingContext;

  return { gl, queried };
};

describe('WebGL2 uniform reflection', () => {
  test('a program with more than 256 active uniforms keeps every uniform index distinct', () => {
    const count = 300;
    const { gl, queried } = createStubContext(count);
    const shader = new WebGl2Shader('#version 300 es\nvoid main() {}', '#version 300 es\nvoid main() {}');

    shader.connect(createWebGl2ShaderProgram(gl));
    shader.sync();

    expect(queried).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(shader.uniforms.size).toBe(count);
    expect(shader.uniforms.get('u299')?.index).toBe(299);
  });
});
