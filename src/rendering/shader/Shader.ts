import type { ShaderAttribute } from './ShaderAttribute';
import type { ShaderUniform } from './ShaderUniform';

export interface IShaderRuntime {
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
    private _runtime: IShaderRuntime | null = null;

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

    public connect(runtime: IShaderRuntime): this {
        this._runtime = runtime;
        runtime.initialize(this);

        return this;
    }

    public disconnect(): this {
        this._runtime = null;
        this.attributes.clear();
        this.uniforms.clear();

        return this;
    }

    public bind(): this {
        this._runtime?.bind(this);

        return this;
    }

    public unbind(): this {
        this._runtime?.unbind(this);

        return this;
    }

    public sync(): this {
        this._runtime?.sync(this);

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
        this._runtime?.destroy(this);
        this._runtime = null;
        this.attributes.clear();
        this.uniforms.clear();
    }
}
