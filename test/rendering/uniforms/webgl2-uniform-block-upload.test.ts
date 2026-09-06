/**
 * The WebGL2 half of the upload contract: a declared uniform block gets one
 * UBO, is bound to its declaration index before every draw, and is re-uploaded
 * only when the block's revision moved.
 *
 * The binding has to be re-established per sync even when nothing changed -
 * uniform-buffer binding points are context state shared by every program - so
 * the two counts are asserted separately: bindings per sync, uploads per
 * change.
 *
 * A stub context rather than a real one: what is under test is which GL calls
 * the program issues and how often, which a driver would only obscure. The
 * generated GLSL itself is compiled for real by the WebGL2 browser lane.
 */

import { describe, expect, test, vi } from 'vitest';

import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Shader } from '#rendering/shader/Shader';
import { UniformType } from '#rendering/uniforms/UniformType';
import { createWebGl2ShaderProgram } from '#rendering/webgl2/shaderProgram';
import { WebGl2Shader } from '#rendering/webgl2/WebGl2Shader';

const GLSL_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
void main() { gl_Position = vec4(a_position + uniforms.origin, 0.0, 1.0); }
`;

const GLSL_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() { fragColor = uniforms.tint; }
`;

const declaration = { origin: UniformType.Vec2, tint: UniformType.Vec4 } as const;

/**
 * Enough of a WebGL2 context to link a program and record its buffer traffic.
 * Reflection reports no attributes, no free uniforms and no blocks of its own,
 * so only the schema-driven path is exercised.
 */
const createStubContext = (): { gl: WebGL2RenderingContext; calls: Array<ReturnType<typeof vi.fn>> } => {
  const bufferData = vi.fn();
  const bufferSubData = vi.fn();
  const bindBufferBase = vi.fn();
  const uniformBlockBinding = vi.fn();
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ACTIVE_ATTRIBUTES: 0x8b89,
    ACTIVE_UNIFORMS: 0x8b86,
    ACTIVE_UNIFORM_BLOCKS: 0x8a36,
    UNIFORM_BLOCK_INDEX: 0x8a3a,
    UNIFORM_BUFFER: 0x8a11,
    DYNAMIC_DRAW: 0x88e8,
    INVALID_INDEX: 0xffffffff,
    createShader: () => ({}) as WebGLShader,
    shaderSource: () => undefined,
    compileShader: () => undefined,
    createProgram: () => ({}) as WebGLProgram,
    attachShader: () => undefined,
    linkProgram: () => undefined,
    useProgram: () => undefined,
    deleteShader: () => undefined,
    deleteProgram: () => undefined,
    deleteBuffer: () => undefined,
    getExtension: () => null,
    getShaderParameter: () => true,
    // Linked, with nothing to reflect: zero attributes, uniforms and blocks.
    getProgramParameter: (_program: WebGLProgram, name: number) => name === 0x8b82,
    getActiveUniforms: () => [],
    getUniformBlockIndex: () => 0,
    uniformBlockBinding,
    createBuffer: () => ({}) as WebGLBuffer,
    bindBuffer: () => undefined,
    bufferData,
    bufferSubData,
    bindBufferBase,
  } as unknown as WebGL2RenderingContext;

  return { gl, calls: [bufferData, bufferSubData, bindBufferBase, uniformBlockBinding] };
};

const connect = (material: MeshMaterial<typeof declaration>, gl: WebGL2RenderingContext): WebGl2Shader => {
  const glsl = material.shader._resolveGlsl()!;
  const shader = new WebGl2Shader(glsl.vertex!, glsl.fragment);

  shader.uniformBlockData = material._blocks;
  shader.connect(createWebGl2ShaderProgram(gl));

  return shader;
};

describe('WebGL2 typed uniform block upload', () => {
  const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT }, uniforms: declaration });

  test('the block gets one buffer, bound to its declaration index, sized to the layout', () => {
    const { gl, calls } = createStubContext();
    const [bufferData, bufferSubData, bindBufferBase, uniformBlockBinding] = calls;
    const material = new MeshMaterial({ shader: source });

    connect(material, gl).sync();

    expect(bufferData).toHaveBeenCalledTimes(1);
    expect(bufferData).toHaveBeenCalledWith(gl.UNIFORM_BUFFER, material._blocks[0]!.byteLength, gl.DYNAMIC_DRAW);
    expect(uniformBlockBinding).toHaveBeenCalledTimes(1);
    expect(uniformBlockBinding).toHaveBeenCalledWith(expect.anything(), 0, 0);
    expect(bindBufferBase).toHaveBeenCalledTimes(1);
    expect(bufferSubData).toHaveBeenCalledTimes(1);
  });

  test('an unchanged block re-binds but never re-uploads', () => {
    const { gl, calls } = createStubContext();
    const [, bufferSubData, bindBufferBase] = calls;
    const material = new MeshMaterial({ shader: source });
    const shader = connect(material, gl);

    shader.sync();
    shader.sync();
    shader.sync();

    expect(bindBufferBase).toHaveBeenCalledTimes(3);
    expect(bufferSubData).toHaveBeenCalledTimes(1);
  });

  test('a changed value uploads exactly once, and writing the same value again does not', () => {
    const { gl, calls } = createStubContext();
    const [, bufferSubData] = calls;
    const material = new MeshMaterial({ shader: source });
    const shader = connect(material, gl);

    shader.sync();
    expect(bufferSubData).toHaveBeenCalledTimes(1);

    material.uniforms.tint.set(1, 0, 0, 1);
    shader.sync();
    shader.sync();
    expect(bufferSubData).toHaveBeenCalledTimes(2);

    material.uniforms.tint.set(1, 0, 0, 1);
    shader.sync();
    expect(bufferSubData).toHaveBeenCalledTimes(2);

    material.uniforms.origin.set(3, 4);
    shader.sync();
    expect(bufferSubData).toHaveBeenCalledTimes(3);
  });

  test('two materials on one source upload their own bytes', () => {
    const { gl, calls } = createStubContext();
    const [, bufferSubData] = calls;
    const first = new MeshMaterial({ shader: source });
    const second = new MeshMaterial({ shader: source });
    const firstShader = connect(first, gl);
    const secondShader = connect(second, gl);

    first.uniforms.tint.set(1, 0, 0, 1);
    firstShader.sync();
    secondShader.sync();

    const [, , firstBytes] = bufferSubData!.mock.calls[0] as [number, number, Float32Array];
    const [, , secondBytes] = bufferSubData!.mock.calls[1] as [number, number, Float32Array];

    expect(firstBytes).not.toBe(secondBytes);
    expect(firstBytes).toBe(first._blocks[0]!.float32);
    expect(secondBytes).toBe(second._blocks[0]!.float32);
  });

  test('a block the linker dropped claims no buffer', () => {
    const { gl, calls } = createStubContext();
    const [bufferData] = calls;
    const material = new MeshMaterial({ shader: source });

    vi.spyOn(gl, 'getUniformBlockIndex').mockReturnValue(gl.INVALID_INDEX);
    connect(material, gl).sync();

    expect(bufferData).not.toHaveBeenCalled();
  });
});
