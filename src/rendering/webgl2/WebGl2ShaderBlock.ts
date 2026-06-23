import { ShaderUniform } from '#rendering/shader/ShaderUniform';

import { webGl2PrimitiveArrayConstructors, webGl2PrimitiveByteSizeMapping } from './WebGl2ShaderMappings';

export class WebGl2ShaderBlock {
  public readonly index: number;
  public readonly name: string;
  public readonly binding: number;
  public readonly dataSize: number;

  private readonly _context: WebGL2RenderingContext;
  private readonly _program: WebGLProgram;
  private readonly _blockData: ArrayBuffer;
  private readonly _uniformBuffer: WebGLBuffer | null;
  private readonly _uniforms: Map<string, ShaderUniform> = new Map<string, ShaderUniform>();

  public constructor(gl: WebGL2RenderingContext, program: WebGLProgram, index: number) {
    this._context = gl;
    this._program = program;
    this.index = index;
    this.name = gl.getActiveUniformBlockName(program, index) || '';
    this.binding = gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_BINDING);
    this.dataSize = gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE);
    this._uniformBuffer = gl.createBuffer();
    this._blockData = new ArrayBuffer(this.dataSize);

    this._extractUniforms();

    gl.bindBuffer(gl.UNIFORM_BUFFER, this._uniformBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, this._blockData, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, this.binding, this._uniformBuffer);
    gl.uniformBlockBinding(this._program, this.index, this.binding);
  }

  public getUniform(name: string): ShaderUniform {
    if (!this._uniforms.has(name)) {
      throw new Error(`Uniform "${name}" is not available.`);
    }

    return this._uniforms.get(name)!;
  }

  public upload(): void {
    const gl = this._context;

    gl.bindBuffer(gl.UNIFORM_BUFFER, this._uniformBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this._blockData);
  }

  public destroy(): void {
    for (const uniform of this._uniforms.values()) {
      uniform.destroy();
    }

    this._uniforms.clear();
  }

  private _extractUniforms(): void {
    const gl = this._context;
    const program = this._program;
    const blockData = this._blockData;
    // `getActiveUniformBlockParameter`/`getActiveUniforms` are typed `any` in
    // lib.dom; the WebGL2 spec returns a Uint32Array of active uniform indices
    // for UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES and an Int32Array of byte offsets
    // for UNIFORM_OFFSET.
    const indices = gl.getActiveUniformBlockParameter(program, this.index, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES) as Uint32Array;
    const offsets = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET) as Int32Array;
    const len = indices.length;

    for (let i = 0; i < len; i++) {
      // In-bounds: `i` < `len` (= `indices.length`); `offsets` is parallel to `indices`.
      const index = indices[i]!;
      const { type, size, name } = gl.getActiveUniform(program, index)!;
      const arrayConstructor = webGl2PrimitiveArrayConstructors[type];
      const byteSize = webGl2PrimitiveByteSizeMapping[type];

      if (arrayConstructor === undefined || byteSize === undefined) {
        throw new Error(`Unsupported uniform type ${type} for uniform "${name}".`);
      }

      const data = new arrayConstructor(blockData, offsets[i], byteSize * size);
      const uniform = new ShaderUniform(index, type, size, name, data);

      this._uniforms.set(uniform.propName, uniform);
    }
  }
}
