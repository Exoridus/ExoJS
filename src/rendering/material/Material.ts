import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { SamplerOptions } from '@/rendering/texture/Sampler';
import type { Texture } from '@/rendering/texture/Texture';
import { BlendModes } from '@/rendering/types';

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

  /** Initial uniform values; mutate per frame via {@link Material.uniforms}. */
  readonly uniforms?: Record<string, UniformValue>;

  /** Named texture bindings claimed in addition to the drawable's own texture. */
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
   * Mutable user uniform values. Mutate between frames to drive animated
   * effects; the renderer reads from this map every draw.
   *
   *   material.uniforms.u_time = performance.now() / 1000;
   *   material.uniforms.u_color = [1, 0.5, 0, 1];
   */
  public uniforms: Record<string, UniformValue>;

  /** Named texture bindings claimed in addition to the drawable's own texture. */
  public textures: Record<string, Texture | RenderTexture>;

  /** Compositing blend mode applied when drawing with this material. */
  public blendMode: BlendModes;

  /** Backend-agnostic sampling state descriptor, or `null` for the default. */
  public sampler: SamplerOptions | null;

  /** Which drawable class this material can serve; renderers check compatibility. */
  public abstract readonly target: 'mesh' | 'sprite';

  private readonly _id: number;
  private readonly _disposeCallbacks = new Set<() => void>();

  protected constructor(options: MaterialOptions) {
    if (options.shader === undefined || options.shader === null) {
      throw new Error('Material requires a `shader` ShaderSource.');
    }

    this.shader = options.shader;
    this.uniforms = { ...(options.uniforms ?? {}) };
    this.textures = { ...(options.textures ?? {}) };
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
    return deriveBindKey(this._id, this.uniforms, this.textures);
  }

  /**
   * Set a uniform value. Equivalent to `material.uniforms[name] = value`,
   * returned `this` for chaining.
   */
  public setUniform(name: string, value: UniformValue): this {
    this.uniforms[name] = value;

    return this;
  }

  /**
   * Bind a named texture. Equivalent to `material.textures[name] = texture`,
   * returned `this` for chaining.
   */
  public setTexture(name: string, texture: Texture | RenderTexture): this {
    this.textures[name] = texture;

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
}
