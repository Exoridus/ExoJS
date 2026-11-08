import { WebGl2ShaderBlock } from '#rendering/webgl2/WebGl2ShaderBlock';

test('destroy releases an owned uniform buffer exactly once', () => {
  const buffer = {} as WebGLBuffer;
  const gl = {
    UNIFORM_BLOCK_BINDING: 1,
    UNIFORM_BLOCK_DATA_SIZE: 2,
    UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES: 3,
    getActiveUniformBlockName: vi.fn(() => 'Scene'),
    getActiveUniformBlockParameter: vi.fn((_program: WebGLProgram, _index: number, parameter: number) =>
      parameter === 3 ? new Uint32Array(0) : parameter === 2 ? 16 : 0,
    ),
    getActiveUniforms: vi.fn(() => new Int32Array(0)),
    createBuffer: vi.fn(() => buffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bindBufferBase: vi.fn(),
    uniformBlockBinding: vi.fn(),
    deleteBuffer: vi.fn(),
  } as unknown as WebGL2RenderingContext;
  const block = new WebGl2ShaderBlock(gl, {} as WebGLProgram, 0);

  block.destroy();
  block.destroy();

  expect(gl.deleteBuffer).toHaveBeenCalledExactlyOnceWith(buffer);
});

describe('same-named members of different structs', () => {
  const makeBlock = (): WebGl2ShaderBlock => {
    const members = [
      { name: 'uA.color', type: 0x8b52, size: 1 },
      { name: 'uB.color', type: 0x8b52, size: 1 },
      { name: 'uB.size', type: 0x1406, size: 1 },
    ];
    const gl = {
      UNIFORM_BLOCK_BINDING: 1,
      UNIFORM_BLOCK_DATA_SIZE: 2,
      UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES: 3,
      UNIFORM_OFFSET: 4,
      getActiveUniformBlockName: vi.fn(() => 'Scene'),
      getActiveUniformBlockParameter: vi.fn((_p: WebGLProgram, _i: number, parameter: number) =>
        parameter === 3 ? new Uint32Array([0, 1, 2]) : parameter === 2 ? 64 : 0,
      ),
      getActiveUniforms: vi.fn(() => new Int32Array([0, 16, 32])),
      getActiveUniform: vi.fn((_p: WebGLProgram, index: number) => members[index]),
      createBuffer: vi.fn(() => ({}) as WebGLBuffer),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      bindBufferBase: vi.fn(),
      uniformBlockBinding: vi.fn(),
    } as unknown as WebGL2RenderingContext;

    return new WebGl2ShaderBlock(gl, {} as WebGLProgram, 0);
  };

  test('each member stays addressable by its full name and does not alias another', () => {
    const block = makeBlock();

    expect(block.getUniform('uA.color')).not.toBe(block.getUniform('uB.color'));
    expect(block.getUniform('uA.color').name).toBe('uA.color');
  });

  test('an ambiguous leaf name is rejected instead of resolving to the last member', () => {
    const block = makeBlock();

    expect(() => block.getUniform('color')).toThrow(/ambiguous/);
    expect(block.getUniform('size').name).toBe('uB.size');
  });
});
