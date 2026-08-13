import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { SamplerOptions } from '#rendering/texture/Sampler';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { deriveBindKey, derivePipelineKey } from './MaterialKey';
import type { ShaderSource } from './ShaderSource';

/**
 * Value accepted by a material uniform. Scalars and small tuples
 * auto-marshal to the appropriate `Float32Array`/`Int32Array` for the
 * backend's uniform call. `Texture`/`RenderTexture` values are bound to
 * texture slots starting at slot 1 — slot 0 is reserved for the drawable's
 * own `texture`.
 */
export type UniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | Int32Array
  | Texture
  | RenderTexture;

/** Whether a material-uniform value occupies a texture binding. @internal */
export const isTextureUniformValue = (value: UniformValue): value is Texture | RenderTexture =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

/**
 * Immutable binding layout captured when a material is constructed. Values
 * behind these names stay live; only the name/order/kind contract is fixed.
 * @internal
 */
export interface MaterialBindingSchema {
  readonly scalarUniformNames: readonly string[];
  readonly textureUniformNames: readonly string[];
  readonly textureNames: readonly string[];
}

/**
 * Construction options shared by every {@link Material}.
 *
 * Only `shader` is required. Textures may be supplied either through the
 * dedicated `textures` map or as texture-valued entries in `uniforms`;
 * both are honoured by the bind-key derivation.
 */
export interface MaterialOptions {
  /** GLSL/WGSL source pair backing this material. */
  readonly shader: ShaderSource;

  /**
   * Declared uniform slots and their initial values. Names and scalar/texture
   * kinds form a fixed construction-time schema; values remain mutable.
   */
  readonly uniforms?: Record<string, UniformValue>;

  /** Declared texture slots claimed in addition to the drawable's own texture. */
  readonly textures?: Record<string, Texture | RenderTexture>;

  /** Compositing blend mode; defaults to {@link BlendModes.Normal}. */
  readonly blendMode?: BlendModes;

  /**
   * Backend-agnostic sampling state descriptor, or `null` to inherit the
   * backend/texture default. Defaults to `null`.
   */
  readonly sampler?: SamplerOptions | null;
}

let nextMaterialId = 1;

/**
 * Describes the look of a renderable — shader, uniforms, textures, blend
 * mode, and sampling state — independent of its geometry.
 *
 * A `Material` can be shared across many drawables; renderers cache
 * compiled programs/pipelines keyed on {@link pipelineKey} and reuse
 * bindings keyed on {@link bindKey}. Subclasses fix the {@link target}
 * drawable class. Call {@link destroy} when the material is no longer
 * needed to release the GPU resources cached on every backend it was used
 * on.
 *
 * Both keys are derived live from the current material state, so they stay
 * stable across repeated reads and change exactly when the relevant state
 * changes — even when {@link uniforms}, {@link textures}, {@link blendMode},
 * or {@link sampler} are mutated in place.
 * @advanced
 */
export abstract class Material {
  /** GLSL/WGSL source pair backing this material. */
  public readonly shader: ShaderSource;

  /**
   * Live user uniform values. Construction declares the fixed set of names and
   * each name's scalar/texture kind; existing values can be replaced between
   * frames and typed arrays can be mutated in place.
   *
   *   material.uniforms.u_time = performance.now() / 1000;
   *   material.uniforms.u_color = [1, 0.5, 0, 1];
   */
  public get uniforms(): Record<string, UniformValue> {
    return this._uniformView;
  }

  /** Live identities behind the fixed named texture slots. */
  public get textures(): Record<string, Texture | RenderTexture> {
    return this._textureView;
  }

  /** Compositing blend mode applied when drawing with this material. */
  public blendMode: BlendModes;

  /** Backend-agnostic sampling state descriptor, or `null` for the default. */
  public sampler: SamplerOptions | null;

  /** Which drawable class this material can serve; renderers check compatibility. */
  public abstract readonly target: 'mesh' | 'sprite' | 'particle';

  private readonly _id: number;
  private readonly _disposeCallbacks = new Set<() => void>();
  private readonly _uniformValues: Record<string, UniformValue>;
  private readonly _textureValues: Record<string, Texture | RenderTexture>;
  private readonly _uniformView: Record<string, UniformValue>;
  private readonly _textureView: Record<string, Texture | RenderTexture>;
  /** Fixed construction-time binding schema used by both backends. @internal */
  public readonly _bindingSchema: MaterialBindingSchema;

  protected constructor(options: MaterialOptions) {
    if (options.shader === undefined || options.shader === null) {
      throw new Error('Material requires a `shader` ShaderSource.');
    }

    this.shader = options.shader;
    this._uniformValues = { ...(options.uniforms ?? {}) };
    this._textureValues = { ...(options.textures ?? {}) };
    this._uniformView = this._createUniformView();
    this._textureView = this._createTextureView();

    const scalarUniformNames: string[] = [];
    const textureUniformNames: string[] = [];

    for (const name of Object.keys(this._uniformValues)) {
      if (isTextureUniformValue(this._uniformValues[name]!)) {
        textureUniformNames.push(name);
      } else {
        scalarUniformNames.push(name);
      }
    }

    const textureNames = Object.keys(this._textureValues);

    for (const name of textureNames) {
      if (Object.prototype.hasOwnProperty.call(this._uniformValues, name)) {
        throw new Error(`Material binding \`${name}\` is declared in both \`uniforms\` and \`textures\`.`);
      }
    }

    this._bindingSchema = Object.freeze({
      scalarUniformNames: Object.freeze(scalarUniformNames),
      textureUniformNames: Object.freeze(textureUniformNames),
      textureNames: Object.freeze(textureNames),
    });
    this.blendMode = options.blendMode ?? BlendModes.Normal;
    this.sampler = options.sampler ?? null;
    this._id = nextMaterialId++;
  }

  /**
   * Stable pipeline key: identical ⇒ same GPU pipeline/program can be used.
   * Derived from shader identity, blend mode, and sampler state, and is
   * independent of the owning material instance so identically configured
   * materials share a pipeline. Drives grouping and the pipeline cache.
   */
  public get pipelineKey(): number {
    return derivePipelineKey(this.shader.id, this.blendMode, this.sampler);
  }

  /**
   * Stable bind key: identical ⇒ same bindings (textures unchanged). Derived
   * from this material's identity and the identities of its bound textures.
   * Changes when a texture is swapped; drives bind-group/slot reuse.
   */
  public get bindKey(): number {
    return deriveBindKey(this._id, this._uniformValues, this._textureValues);
  }

  /**
   * Replace a declared uniform value, returning `this` for chaining. Unknown
   * names and scalar↔texture kind changes are rejected.
   */
  public setUniform(name: string, value: UniformValue): this {
    if (!Object.prototype.hasOwnProperty.call(this._uniformView, name)) {
      throw new Error(`Material uniform \`${name}\` is not part of this material's fixed binding schema.`);
    }

    this._uniformView[name] = value;

    return this;
  }

  /**
   * Replace the texture behind a declared slot, returning `this` for chaining.
   */
  public setTexture(name: string, texture: Texture | RenderTexture): this {
    if (!Object.prototype.hasOwnProperty.call(this._textureView, name)) {
      throw new Error(`Material texture \`${name}\` is not part of this material's fixed binding schema.`);
    }

    this._textureView[name] = texture;

    return this;
  }

  /**
   * Release GPU resources cached against this material on every backend
   * that has compiled it. Safe to call multiple times. After destroy, the
   * material can still be re-used — renderers recompile on next draw — but
   * typical usage is to drop the reference.
   */
  public destroy(): void {
    for (const callback of this._disposeCallbacks) {
      callback();
    }

    this._disposeCallbacks.clear();
  }

  /**
   * Internal hook for renderers to register a per-material-instance cleanup
   * callback (release compiled program, pipeline, or bind groups). The
   * callback fires on {@link destroy}; renderers MUST also tolerate the
   * material being garbage-collected without destroy ever being called.
   *
   * @internal
   */
  public _onDispose(callback: () => void): void {
    this._disposeCallbacks.add(callback);
  }

  /** Read a declared uniform without crossing the public guarded view. @internal */
  public _getUniformValue(name: string): UniformValue {
    return this._uniformValues[name]!;
  }

  /** Read a declared texture without crossing the public guarded view. @internal */
  public _getTextureValue(name: string): Texture | RenderTexture {
    return this._textureValues[name]!;
  }

  private _createUniformView(): Record<string, UniformValue> {
    const view: Record<string, UniformValue> = {};

    for (const name of Object.keys(this._uniformValues)) {
      const textureSlot = isTextureUniformValue(this._uniformValues[name]!);

      Object.defineProperty(view, name, {
        enumerable: true,
        configurable: false,
        get: () => this._uniformValues[name]!,
        set: (value: UniformValue) => {
          if (isTextureUniformValue(value) !== textureSlot) {
            throw new Error(
              `Material uniform \`${name}\` cannot change binding kind from ${textureSlot ? 'texture' : 'scalar'} to ${textureSlot ? 'scalar' : 'texture'}.`,
            );
          }

          this._uniformValues[name] = value;
        },
      });
    }

    return Object.preventExtensions(view);
  }

  private _createTextureView(): Record<string, Texture | RenderTexture> {
    const view: Record<string, Texture | RenderTexture> = {};

    for (const name of Object.keys(this._textureValues)) {
      Object.defineProperty(view, name, {
        enumerable: true,
        configurable: false,
        get: () => this._textureValues[name]!,
        set: (value: Texture | RenderTexture) => {
          if (!isTextureUniformValue(value)) {
            throw new Error(`Material texture \`${name}\` must remain a texture binding.`);
          }

          this._textureValues[name] = value;
        },
      });
    }

    return Object.preventExtensions(view);
  }
}
