import type { ShaderAttribute } from './ShaderAttribute';
import type { ShaderUniform } from './ShaderUniform';

export interface ShaderProgram {
    initialize(shader: Shader): void;
    bind(shader: Shader): void;
    unbind(shader: Shader): void;
    sync(shader: Shader): void;
    destroy(shader: Shader): void;
}

export class Shader {

    public readonly attributes: Map<string, ShaderAttribute> = new Map<string, ShaderAttribute>();
    public readonly uniforms: Map<string, ShaderUniform> = new Map<string, ShaderUniform>();

    private readonly _vertexSource: string;
    private readonly _fragmentSource: string;
    private _program: ShaderProgram | null = null;

    public constructor(vertexSource: string, fragmentSource: string) {
        this._vertexSource = vertexSource;
        this._fragmentSource = fragmentSource;
    }

    public get vertexSource(): string {
        return this._vertexSource;
    }

    public get fragmentSource(): string {
        return this._fragmentSource;
    }

    public connect(program: ShaderProgram): this {
        this._program = program;
        program.initialize(this);

        return this;
    }

    public disconnect(): this {
        this._program = null;
        this.attributes.clear();
        this.uniforms.clear();

        return this;
    }

    public bind(): this {
        this._program?.bind(this);

        return this;
    }

    public unbind(): this {
        this._program?.unbind(this);

        return this;
    }

    public sync(): this {
        this._program?.sync(this);

        return this;
    }

    public getAttribute(name: string): ShaderAttribute {
        const attribute = this.attributes.get(name);

        if (!attribute) {
            throw new Error(`Attribute "${name}" is not available.`);
        }

        return attribute;
    }

    public getUniform(name: string): ShaderUniform {
        const uniform = this.uniforms.get(name);

        if (!uniform) {
            throw new Error(`Uniform "${name}" is not available.`);
        }

        return uniform;
    }

    public destroy(): void {
        this._program?.destroy(this);
        this._program = null;
        this.attributes.clear();
        this.uniforms.clear();
    }
}
