import { ShaderAttribute } from './ShaderAttribute';
import { ShaderUniform } from './ShaderUniform';
import { ShaderBlock } from './ShaderBlock';
import { PrimitiveArrayConstructors, primitiveByteSizeMapping } from 'types/rendering';

export class Shader {

    public readonly attributes: Map<string, ShaderAttribute> = new Map<string, ShaderAttribute>();
    public readonly uniforms: Map<string, ShaderUniform> = new Map<string, ShaderUniform>();
    public readonly uniformBlocks: Map<string, ShaderBlock> = new Map<string, ShaderBlock>();

    private readonly _vertexSource: string;
    private readonly _fragmentSource: string;
    private _context: WebGL2RenderingContext | null = null;
    private _vertexShader: WebGLShader | null = null;
    private _fragmentShader: WebGLShader | null = null;
    private _program: WebGLProgram | null = null;

    constructor(vertexSource: string, fragmentSource: string) {
        this._vertexSource = vertexSource;
        this._fragmentSource = fragmentSource;
    }

    createShader(type: number, source: string): WebGLShader | null {
        if (!this._context) {
            throw Error("Tried to create shader without webgl context.")
        }

        const gl = this._context;
        const shader = gl.createShader(type);

        if (!shader) {
            return null;
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            window.console.log(gl.getShaderInfoLog(shader));

            return null;
        }

        return shader;
    }

    createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
        if (!this._context) {
            throw Error("Tried to create program without webgl context.");
        }

        const gl = this._context;
        const program = gl.createProgram();

        if (!program) {
            return null;
        }

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.detachShader(program, vertexShader);
            gl.detachShader(program, fragmentShader);

            gl.deleteProgram(program);

            console.error('gl.VALIDATE_STATUS', gl.getProgramParameter(program, gl.VALIDATE_STATUS)); // eslint-disable-line
            console.error('gl.getError()', gl.getError()); // eslint-disable-line

            if (gl.getProgramInfoLog(program)) {
                console.warn('gl.getProgramInfoLog()', gl.getProgramInfoLog(program)); // eslint-disable-line
            }

            return null;
        }

        return program;
    }

    connect(gl: WebGL2RenderingContext): this {
        if (!this._context) {
            this._context = gl;
            this._vertexShader = this.createShader(gl.VERTEX_SHADER, this._vertexSource);
            this._fragmentShader = this.createShader(gl.FRAGMENT_SHADER, this._fragmentSource);

            if (!this._vertexShader || !this._fragmentShader) {
                throw new Error("Could not create vertex/fragment shader.")
            }

            this._program = this.createProgram(this._vertexShader, this._fragmentShader);

            if (!this._program) {
                throw new Error("Could not create shader program.")
            }

            this._extractAttributes();
            this._extractUniforms();
            this._extractUniformBlocks();
        }

        return this;
    }

    disconnect(): this {
        this.unbindProgram();

        if (this._context) {
            const gl = this._context;

            gl.deleteShader(this._vertexShader);
            gl.deleteShader(this._fragmentShader);
            gl.deleteProgram(this._program);

            for (const attribute of this.attributes.values()) {
                attribute.destroy();
            }

            for (const uniform of this.uniforms.values()) {
                uniform.destroy();
            }

            for (const uniformBlock of this.uniformBlocks.values()) {
                uniformBlock.destroy();
            }

            this.attributes.clear();
            this.uniforms.clear();
            this.uniformBlocks.clear();

            this._vertexShader = null;
            this._fragmentShader = null;
            this._program = null;
            this._context = null;
        }

        return this;
    }

    bindProgram(): this {
        if (!this._context) {
            throw new Error('No context!')
        }

        const gl = this._context;

        gl.useProgram(this._program);

        for (const uniform of this.uniforms.values()) {
            uniform.upload();
        }

        for (const uniformBlock of this.uniformBlocks.values()) {
            uniformBlock.upload();
        }

        return this;
    }

    unbindProgram(): this {
        if (this._context) {
            this._context.useProgram(null);
        }

        return this;
    }

    getAttribute(name: string): ShaderAttribute {
        if (!this.attributes.has(name)) {
            throw new Error(`Attribute "${name}" is not available.`);
        }

        return this.attributes.get(name)!;
    }

    getUniform(name: string): ShaderUniform {
        if (!this.uniforms.has(name)) {
            throw new Error(`Uniform Block "${name}" is not available.`);
        }

        return this.uniforms.get(name)!;
    }

    getUniformBlock(name: string): ShaderBlock {
        if (!this.uniformBlocks.has(name)) {
            throw new Error(`Uniform Block "${name}" is not available.`);
        }

        return this.uniformBlocks.get(name)!;
    }

    destroy(): void {
        this.disconnect();
    }

    _extractAttributes() {
        const gl = this._context!;
        const program = this._program!;
        const activeAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

        for (let i = 0; i < activeAttributes; i++) {
            const { name, type } = gl.getActiveAttrib(program, i)!;

            this.attributes.set(name, new ShaderAttribute(gl, program, i, name, type));
        }
    }

    _extractUniforms() {
        const gl = this._context!;
        const program = this._program!;
        const activeCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        const activeIndices = new Uint8Array(activeCount).map((value, index) => index);
        const blocks = gl.getActiveUniforms(program, activeIndices, gl.UNIFORM_BLOCK_INDEX);
        const indices = activeIndices.filter((index) => (blocks[index] === -1));

        for (const index of indices) {
            const { type, size, name } = gl.getActiveUniform(program, index)!;
            const data = new PrimitiveArrayConstructors[type](primitiveByteSizeMapping[type] * size);
            const uniform = new ShaderUniform(gl, program, index, type, size, name, data);

            this.uniforms.set(uniform.name, uniform);
        }
    }

    _extractUniformBlocks() {
        const gl = this._context!;
        const program = this._program!;
        const activeBlocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS);

        for (let index = 0; index < activeBlocks; index++) {
            const uniformBlock = new ShaderBlock(gl, program, index);

            this.uniformBlocks.set(uniformBlock.name, uniformBlock);
        }
    }
}
