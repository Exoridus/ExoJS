import type { ShaderAttribute } from './ShaderAttribute';
import type { ShaderUniform } from './ShaderUniform';

/**
 * Backend-specific GPU program object paired to a {@link Shader}.
 * Implemented separately for WebGL2 and WebGPU so `Shader` stays backend-agnostic.
 * @internal
 */
export interface ShaderProgram {
  /** Compile and link the GPU program, then populate `shader.attributes` and `shader.uniforms`. */
  initialize(shader: Shader): void;
  /** Activate this program for subsequent draw calls. */
  bind(shader: Shader): void;
  /** Deactivate this program. */
  unbind(shader: Shader): void;
  /** Upload dirty uniform values to the GPU. */
  sync(shader: Shader): void;
  /** Release all GPU resources held by this program. */
  destroy(shader: Shader): void;
}

/**
 * Backend-agnostic shader program descriptor.
 *
 * Holds raw GLSL source strings and, after {@link connect} is called, a live
 * {@link ShaderProgram} with populated {@link attributes} and {@link uniforms} maps.
 * Call {@link bind} before draw calls and {@link sync} after updating uniform values.
 * Both maps are cleared on {@link disconnect} and {@link destroy}.
 */
export class Shader {
  /** Vertex attribute metadata populated by the backend after {@link connect}. */
  public readonly attributes: Map<string, ShaderAttribute> = new Map<string, ShaderAttribute>();
  /** Uniform metadata populated by the backend after {@link connect}. */
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

  /**
   * Attach a backend GPU program, compile/link it, and populate the attribute and uniform maps.
   * Must be called before {@link bind}, {@link sync}, or accessing {@link attributes}/{@link uniforms}.
   */
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

  /**
   * Upload all dirty {@link ShaderUniform} values to the GPU.
   * Call once per draw call after modifying uniform data.
   */
  public sync(): this {
    this._program?.sync(this);

    return this;
  }

  /**
   * Retrieve a named vertex attribute from the map populated by the backend.
   * @throws Error if no attribute with `name` exists.
   */
  public getAttribute(name: string): ShaderAttribute {
    const attribute = this.attributes.get(name);

    if (!attribute) {
      throw new Error(`Attribute "${name}" is not available.`);
    }

    return attribute;
  }

  /**
   * Retrieve a named uniform from the map populated by the backend.
   * @throws Error if no uniform with `name` exists.
   */
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
