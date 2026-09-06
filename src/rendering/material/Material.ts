import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import { BlendModes } from '#rendering/types';
import type { UniformFieldAccessors } from '#rendering/uniforms/uniformAccessors';
import type { UniformBlockData } from '#rendering/uniforms/UniformBlockData';
import type { UniformBlockRecord, UniformFields, UniformStructInput } from '#rendering/uniforms/uniformDeclarations';
import type { UniformBlockDataRecord, UniformBlockInitialValues } from '#rendering/uniforms/uniformSchema';
import { createUniformBlockData, uniformBlockRecord } from '#rendering/uniforms/uniformSchema';

import { deriveBindKey, derivePipelineKey } from './MaterialKey';
import type { ShaderSource } from './ShaderSource';

/**
 * Value accepted by a material uniform on a shader source that declares no
 * uniform schema. Scalars and small tuples auto-marshal to the appropriate
 * `Float32Array`/`Int32Array` for the backend's uniform call.
 * `Texture`/`RenderTexture` values are bound to texture slots starting at slot
 * 1 - slot 0 is reserved for the drawable's own `texture`.
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
 * What {@link Material.uniforms} exposes: typed accessors when the shader
 * source declares `uniforms`, the mutable value record when it declares no
 * schema, and nothing when it declares named blocks instead.
 */
export type MaterialUniformsView<F, B> = F extends UniformFields
  ? UniformFieldAccessors<F>
  : B extends UniformBlockRecord
    ? never
    : Record<string, UniformValue>;

/** What {@link Material.uniformBlocks} exposes for a named-block schema. */
export type MaterialUniformBlocksView<B> = B extends UniformBlockRecord ? UniformBlockDataRecord<B> : never;

/** Starting values accepted for the declared uniforms. */
export type MaterialUniformValues<F, B> = F extends UniformFields ? UniformStructInput<F> : B extends UniformBlockRecord ? never : Record<string, UniformValue>;

/** A uniform name the raw path accepts; `never` once a schema is declared. */
export type MaterialRawUniformName<F, B> = F extends UniformFields ? never : B extends UniformBlockRecord ? never : string;

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
 * Only `shader` is required. What `uniforms` means follows from the shader
 * source: on a source that declares a uniform schema it carries starting values
 * for the declared fields, and textures must go in `textures`; on a source
 * without one it is the mutable value record, where texture-valued entries also
 * claim a texture binding.
 */
export interface MaterialOptions<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> {
  /** GLSL/WGSL source pair backing this material. */
  readonly shader: ShaderSource<F, B>;

  /**
   * Starting values for the declared uniforms, or - on a source without a
   * schema - the declared uniform slots and their initial values, whose names
   * and scalar/texture kinds form a fixed construction-time schema.
   */
  readonly uniforms?: MaterialUniformValues<F, B>;

  /** Starting values per named block, for a source declaring `uniformBlocks`. */
  readonly uniformBlocks?: B extends UniformBlockRecord ? UniformBlockInitialValues<B> : never;

  /** Declared texture slots claimed in addition to the drawable's own texture. */
  readonly textures?: Record<string, Texture | RenderTexture>;

  /** Compositing blend mode; defaults to {@link BlendModes.Normal}. */
  readonly blendMode?: BlendModes;

  /**
   * Filter/wrap override for the drawable's base texture, or `null` to inherit
   * that texture's sampler. Additional material textures keep their own
   * sampler state. Defaults to `null`.
   */
  readonly sampler?: SamplerOptions | null;
}

let nextMaterialId = 1;

/**
 * Describes the look of a renderable - shader, uniforms, textures, blend
 * mode, and sampling state - independent of its geometry.
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
 * changes - even when {@link uniforms}, {@link textures}, {@link blendMode},
 * or {@link sampler} are mutated in place.
 *
 * # Typed and raw uniforms
 *
 * A shader source that declares a uniform schema gives its materials typed
 * accessors: `material.uniforms.time.set(seconds)` for the implicit block, or
 * `material.uniformBlocks.camera.uniforms.projection.set(matrix)` for named
 * blocks. Writes go into the material's own std140 buffer and are uploaded only
 * when a value changed, and {@link setUniform} is not available.
 *
 * A source without a schema keeps the untyped record: `material.uniforms` is a
 * live map of the names declared at construction, and both languages' uniform
 * declarations are the author's responsibility.
 *
 * Write a function that takes materials of either kind against
 * {@link AnyMaterial} rather than the bare class, whose defaults describe the
 * raw path.
 * @advanced
 */
export abstract class Material<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> {
  /** GLSL/WGSL source pair backing this material. */
  public readonly shader: ShaderSource<F, B>;

  /**
   * The typed accessors of the declared uniform block, or - on a source without
   * a schema - the live user uniform values, where construction declares the
   * fixed set of names and each name's scalar/texture kind:
   *
   *   material.uniforms.u_time = performance.now() / 1000;
   *   material.uniforms.u_color = [1, 0.5, 0, 1];
   */
  public get uniforms(): MaterialUniformsView<F, B> {
    return this._uniformsView as MaterialUniformsView<F, B>;
  }

  /** The declared named uniform blocks, each owning its own values. */
  public get uniformBlocks(): MaterialUniformBlocksView<B> {
    return this._uniformBlocksView as MaterialUniformBlocksView<B>;
  }

  /** Live identities behind the fixed named texture slots. */
  public get textures(): Record<string, Texture | RenderTexture> {
    return this._textureView;
  }

  /** Compositing blend mode applied when drawing with this material. */
  public blendMode: BlendModes;

  /** Filter/wrap override for the drawable's base texture, or `null` to inherit it. */
  public sampler: SamplerOptions | null;

  /** Which drawable class this material can serve; renderers check compatibility. */
  public abstract readonly target: 'mesh' | 'sprite' | 'particle';

  /** The declared uniform blocks in declaration order; empty on the raw path. @internal */
  public readonly _blocks: readonly UniformBlockData[];

  private readonly _id: number;
  private readonly _disposeCallbacks = new Set<() => void>();
  private readonly _uniformValues: Record<string, UniformValue>;
  private readonly _textureValues: Record<string, Texture | RenderTexture>;
  private readonly _uniformsView: unknown;
  private readonly _uniformBlocksView: unknown;
  private readonly _textureView: Record<string, Texture | RenderTexture>;
  /** Fixed construction-time binding schema used by both backends. @internal */
  public readonly _bindingSchema: MaterialBindingSchema;

  protected constructor(options: MaterialOptions<F, B>) {
    if (options.shader === undefined || options.shader === null) {
      throw new Error('Material requires a `shader` ShaderSource.');
    }

    const schema = options.shader.uniformSchema;

    this.shader = options.shader;
    this._uniformValues = schema === null ? { ...(options.uniforms as Record<string, UniformValue> | undefined) } : {};
    this._textureValues = { ...options.textures };
    this._blocks = schema === null ? [] : createUniformBlockData(schema);
    this._textureView = this._createTextureView();

    if (schema === null) {
      this._uniformsView = this._createUniformView();
      this._uniformBlocksView = undefined;
    } else {
      const blocks = uniformBlockRecord(this._blocks);

      applyInitialBlockValues(this._blocks, schema.implicit, options.uniforms, options.uniformBlocks);
      this._uniformsView = schema.implicit ? this._blocks[0]!.uniforms : undefined;
      this._uniformBlocksView = schema.implicit ? undefined : blocks;
    }

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
   * Derived from shader identity and blend mode, and is
   * independent of the owning material instance so identically configured
   * materials share a pipeline. Drives grouping and the pipeline cache.
   */
  public get pipelineKey(): number {
    return derivePipelineKey(this.shader.id, this.blendMode);
  }

  /**
   * Stable bind key: identical ⇒ same bindings (textures unchanged). Derived
   * from this material's identity, base-texture sampler override, and the
   * identities of its bound textures. Changes when a texture is swapped or
   * sampler state changes; drives bind-group/slot reuse.
   */
  public get bindKey(): number {
    return deriveBindKey(this._id, this._uniformValues, this._textureValues, this.sampler);
  }

  /**
   * Replace a declared uniform value, returning `this` for chaining. Unknown
   * names and scalar↔texture kind changes are rejected.
   *
   * Only available on a material whose shader source declares no uniform
   * schema; a typed material writes through {@link uniforms} instead.
   */
  public setUniform(name: MaterialRawUniformName<F, B>, value: UniformValue): this {
    if (this._blocks.length > 0) {
      throw new Error('Material.setUniform is not available on a shader source that declares uniforms; write through `material.uniforms` instead.');
    }

    if (!Object.prototype.hasOwnProperty.call(this._uniformValues, name)) {
      throw new Error(`Material uniform \`${String(name)}\` is not part of this material's fixed binding schema.`);
    }

    (this._uniformsView as Record<string, UniformValue>)[name as string] = value;

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
   * material can still be re-used - renderers recompile on next draw - but
   * typical usage is to drop the reference.
   */
  public destroy(): void {
    for (const callback of this._disposeCallbacks) {
      callback();
    }

    this._disposeCallbacks.clear();
  }

  /**
   * Hook for renderers to register a per-material-instance cleanup callback
   * (release compiled program, pipeline, or bind groups). The callback fires
   * on {@link destroy}; renderers MUST also tolerate the material being
   * garbage-collected without destroy ever being called.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public onDispose(callback: () => void): void {
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

/**
 * A material of any uniform schema.
 *
 * The bare `Material` type describes the untyped path, so a typed material is
 * not one of them; code that accepts either - a renderer, a helper taking any
 * material - names this instead.
 */
export type AnyMaterial = Material<UniformFields | undefined, UniformBlockRecord | undefined>;

/** Write the caller's starting values into the freshly built blocks. */
const applyInitialBlockValues = (blocks: readonly UniformBlockData[], implicit: boolean, uniforms: unknown, uniformBlocks: unknown): void => {
  if (implicit) {
    if (uniforms !== undefined) {
      blocks[0]!._setValues(uniforms as Record<string, unknown>);
    }

    return;
  }

  if (uniformBlocks === undefined) {
    return;
  }

  const values = uniformBlocks as Record<string, Record<string, unknown>>;

  for (const block of blocks) {
    const initial = values[block.layout.key];

    if (initial !== undefined) {
      block._setValues(initial);
    }
  }
};
