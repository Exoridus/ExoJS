import { ShaderUniform } from './ShaderUniform';
import { PrimitiveArrayConstructors, primitiveByteSizeMapping } from '../../types/rendering';

export class ShaderBlock {

    public readonly index: number;
    public readonly name: string;
    public readonly binding: number;
    public readonly dataSize: number;

    private readonly _context: WebGL2RenderingContext;
    private readonly _program: WebGLProgram;
    private readonly _blockData: ArrayBuffer;
    private readonly _uniformBuffer: WebGLBuffer | null;
    private readonly _uniforms: Map<string, ShaderUniform> = new Map<string, ShaderUniform>();

    constructor(gl: WebGL2RenderingContext, program: WebGLProgram, index: number) {

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
        const indices = gl.getActiveUniformBlockParameter(program, this.index, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES);
        const offsets = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET);
        const len = indices.length;

        for (let i = 0; i < len; i++) {
            const { type, size, name } = gl.getActiveUniform(program, indices[i])!;
            const data = new PrimitiveArrayConstructors[type](blockData, offsets[i], primitiveByteSizeMapping[type] * size);
            const uniform = new ShaderUniform(gl, program, indices[i], type, size, name, data);

            this._uniforms.set(uniform.propName, uniform);
        }
    }
}
