import type { UniformBlockData } from '#rendering/uniforms/UniformBlockData';

import type { WebGl2ShaderAttribute } from './WebGl2ShaderAttribute';
import type { WebGl2ShaderUniform } from './WebGl2ShaderUniform';

/**
 * Backend-specific GPU program object paired to a {@link WebGl2Shader}.
 * Implemented separately for WebGL2 and WebGPU so `WebGl2Shader` stays backend-agnostic.
 */
export interface WebGl2ShaderProgram {
  /** Compile and link the GPU program, then populate `shader.attributes` and `shader.uniforms`. */
  initialize(shader: WebGl2Shader): void;
  /** Activate this program for subsequent draw calls. */
  bind(shader: WebGl2Shader): void;
  /** Deactivate this program. */
  unbind(shader: WebGl2Shader): void;
  /** Upload dirty uniform values to the GPU. */
  sync(shader: WebGl2Shader): void;
  /** Release all GPU resources held by this program. */
  destroy(shader: WebGl2Shader): void;
}

/**
 * Backend-agnostic shader program descriptor.
 *
 * Holds raw GLSL source strings and, after {@link connect} is called, a live
 * {@link WebGl2ShaderProgram} with populated {@link attributes} and {@link uniforms} maps.
 * Call {@link bind} before draw calls and {@link sync} after updating uniform values.
 * Both maps are cleared on {@link disconnect} and {@link destroy}.
 * @advanced
 */
export class WebGl2Shader {
  /** Vertex attribute metadata populated by the backend after {@link connect}. */
  public readonly attributes: Map<string, WebGl2ShaderAttribute> = new Map<string, WebGl2ShaderAttribute>();
  /** Uniform metadata populated by the backend after {@link connect}. */
  public readonly uniforms: Map<string, WebGl2ShaderUniform> = new Map<string, WebGl2ShaderUniform>();

  /**
   * Typed uniform blocks the owning material or filter supplies, in declaration
   * order. Assign before {@link connect}: the backend binds each block to its
   * declaration index and uploads it from the block's own buffer whenever the
   * block's revision moves.
   * @internal
   */
  public uniformBlockData: readonly UniformBlockData[] = [];

  private readonly _vertexSource: string;
  private readonly _fragmentSource: string;
  private _program: WebGl2ShaderProgram | null = null;

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
  public connect(program: WebGl2ShaderProgram): this {
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
   * Upload all dirty {@link WebGl2ShaderUniform} values to the GPU.
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
  public getAttribute(name: string): WebGl2ShaderAttribute {
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
  public getUniform(name: string): WebGl2ShaderUniform {
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
