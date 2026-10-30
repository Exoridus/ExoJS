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
