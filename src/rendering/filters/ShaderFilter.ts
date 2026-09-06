import { ShaderSource } from '#rendering/material/ShaderSource';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { upgradeFragmentShaderToGl300 } from '#rendering/shader/upgradeFragmentShaderToGl300';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { UniformFieldAccessors } from '#rendering/uniforms/uniformAccessors';
import type { UniformBlockData } from '#rendering/uniforms/UniformBlockData';
import type { UniformBlockRecord, UniformFields, UniformStructInput } from '#rendering/uniforms/uniformDeclarations';
import { filterUniformGroup } from '#rendering/uniforms/uniformLayout';
import type { UniformBlockDataRecord, UniformBlockInitialValues, UniformSchemaOptions } from '#rendering/uniforms/uniformSchema';
import { createUniformBlockData, uniformBlockRecord } from '#rendering/uniforms/uniformSchema';

import { Filter } from './Filter';
import { ShaderFilterBackendError } from './ShaderFilterBackendError';
import defaultGlslVertexSourceModule from './shaders/default-vertex.vert';
import defaultWgslVertexSourceModule from './shaders/default-vertex.wgsl';
import { WebGl2ShaderFilterPass } from './WebGl2ShaderFilterPass';
import { WebGpuShaderFilterPass } from './WebGpuShaderFilterPass';

/**
 * A scalar number, vector tuple, typed array, or texture - the value types a
 * {@link ShaderFilter} accepts for a user uniform and marshals to the active
 * backend.
 */
export type ShaderFilterUniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | Int32Array
  | Texture
  | RenderTexture;

/**
 * The per-backend half of a {@link ShaderFilter}: one object per language that
 * owns the compiled program/pipeline and draws the fullscreen quad. Built on the
 * first application against a backend of that kind and reused afterwards.
 * @internal
 */
export interface ShaderFilterPass {
  apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution: number): void;
  destroy(): void;
}

/** The shader languages a {@link ShaderFilter} can carry. */
export type ShaderFilterLanguage = 'glsl' | 'wgsl';

/** Shader sources for a {@link ShaderFilter}, one entry per language. */
export interface ShaderFilterSourceOptions {
  /**
   * GLSL ES 3.00 sources for the WebGL2 backend.
   *
   * `vertex` is optional and defaults to a pass-through fullscreen quad that
   * writes the `vUv` varying; supply one only to change how the quad is built.
   */
  readonly glsl?: {
    readonly fragment: string;
    readonly vertex?: string;
  };

  /**
   * WGSL source for the WebGPU backend - one module carrying both entry points,
   * the same convention {@link ShaderSource} uses for materials.
   *
   * The fragment entry point must be `fragmentMain`. A module that declares no
   * `@vertex` stage gets the default fullscreen-quad vertex stage (`vertexMain`,
   * plus its `VsOut` struct) prepended; a module that declares one must name it
   * `vertexMain` and emit `@location(0) vUv: vec2<f32>`.
   */
  readonly wgsl?: string;

  /**
   * Auto-upgrade legacy GLSL ES 1.00 fragment source to GLSL ES 3.00. Default
   * `true` - Shadertoy/ISF-style and modern 3.00 sources are both accepted.
   *
   * Set to `false` for strict 3.00 input, which turns legacy constructs into
   * compile errors instead of silently rewriting them. Only the fragment source
   * is upgraded: a 1.00-style `glsl.vertex` fails to compile as written.
   */
  readonly autoUpgrade?: boolean;
}

/**
 * What {@link ShaderFilter.uniforms} exposes: typed accessors when the shader
 * source declares `uniforms`, the read-only value record when it declares no
 * schema, and nothing when it declares named blocks instead.
 */
export type ShaderFilterUniformsView<F, B> = F extends undefined
  ? B extends undefined
    ? Readonly<Record<string, ShaderFilterUniformValue>>
    : never
  : UniformFieldAccessors<Extract<F, UniformFields>>;

/** What {@link ShaderFilter.uniformBlocks} exposes for a named-block schema. */
export type ShaderFilterBlocksView<B> = B extends undefined ? never : UniformBlockDataRecord<Extract<B, UniformBlockRecord>>;

/** Starting values accepted for the filter's declared uniforms. */
export type ShaderFilterUniformValues<F, B> = F extends undefined
  ? B extends undefined
    ? Record<string, ShaderFilterUniformValue>
    : never
  : UniformStructInput<Extract<F, UniformFields>>;

/** A uniform name the raw path accepts; `never` once a schema is declared. */
export type ShaderFilterRawUniformName<F, B> = F extends undefined ? (B extends undefined ? string : never) : never;

/** Construction options for a {@link ShaderFilter}. */
export interface ShaderFilterOptions<
  F extends UniformFields | undefined = undefined,
  B extends UniformBlockRecord | undefined = undefined,
> extends ShaderFilterSourceOptions {
  /**
   * A ready-made source pair, the way {@link Material} takes one. Takes the
   * place of {@link ShaderFilterSourceOptions.glsl}/{@link ShaderFilterSourceOptions.wgsl}
   * and is used verbatim - no default vertex stage is filled in, and no GLSL
   * upgrade is run.
   */
  readonly shader?: ShaderSource<F, B>;

  /**
   * Starting values for the declared uniforms, or - on a source without a
   * schema - the initial uniform record, updated at runtime through
   * {@link ShaderFilter.setUniform} / {@link ShaderFilter.setUniforms}.
   */
  readonly uniforms?: ShaderFilterUniformValues<F, B>;

  /** Starting values per named block, for a source declaring `uniformBlocks`. */
  readonly uniformBlocks?: B extends undefined ? never : UniformBlockInitialValues<Extract<B, UniformBlockRecord>>;

  /**
   * Textures bound after the uniform blocks, in declaration order, each
   * followed by its sampler. Use this rather than texture-valued `uniforms`
   * entries whenever the source declares a uniform schema.
   */
  readonly textures?: Record<string, Texture | RenderTexture>;
}

/**
 * What a filter pass binds, owned by the filter and read live on every draw.
 * @internal
 */
export interface ShaderFilterBindings {
  readonly uniforms: Readonly<Record<string, ShaderFilterUniformValue>>;
  readonly blocks: readonly UniformBlockData[];
  readonly textures: Readonly<Record<string, Texture | RenderTexture>>;
}

/**
 * Default fullscreen-quad GLSL vertex shader. Positions are already in clip
 * space (-1..1), so no projection matrix is needed.
 * @internal
 */
export const defaultGlslVertexSource: string = defaultGlslVertexSourceModule;

/**
 * Default fullscreen-quad WGSL vertex stage, prepended to a fragment-only WGSL
 * module. Same geometry and same `vUv` semantics as {@link defaultGlslVertexSource}.
 * @internal
 */
export const defaultWgslVertexSource: string = defaultWgslVertexSourceModule;

/** `@vertex` outside a comment - see {@link createFilterShaderSource}. */
const wgslVertexStagePattern = /@vertex\b/;

/** Strip line and block comments so a commented-out `@vertex` does not count. */
const stripComments = (source: string): string => source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');

/** Prepend the default vertex stage to a module that declares none. */
const withWgslVertexStage = (source: string): string => (wgslVertexStagePattern.test(stripComments(source)) ? source : `${defaultWgslVertexSource}\n${source}`);

/**
 * Build the {@link ShaderSource} behind a filter pass: fills in the default
 * vertex stage per language, upgrades legacy GLSL when asked, and carries any
 * uniform declaration through to the source.
 *
 * This is how a filter declares typed uniforms: {@link ShaderFilterOptions.uniforms}
 * carries starting VALUES, so the declaration has to reach the source, and the
 * source is what the filter is then built from with {@link ShaderFilter.from}.
 *
 * ```ts
 * const shader = createFilterShaderSource({
 *   glsl: { fragment },
 *   wgsl,
 *   uniforms: { uTime: UniformType.Float },
 * });
 *
 * const filter = ShaderFilter.from(shader, { uniforms: { uTime: 0 } });
 * ```
 * @advanced
 */
export const createFilterShaderSource = <const F extends UniformFields | undefined = undefined, const B extends UniformBlockRecord | undefined = undefined>(
  options: ShaderFilterSourceOptions & UniformSchemaOptions<F, B>,
): ShaderSource<F, B> => {
  const autoUpgrade = options.autoUpgrade !== false;
  const glsl =
    options.glsl !== undefined
      ? {
          vertex: options.glsl.vertex ?? defaultGlslVertexSource,
          fragment: autoUpgrade ? upgradeFragmentShaderToGl300(options.glsl.fragment) : options.glsl.fragment,
        }
      : undefined;
  const wgsl = options.wgsl !== undefined ? withWgslVertexStage(options.wgsl) : undefined;

  return new ShaderSource<F, B>({
    ...(glsl !== undefined ? { glsl } : {}),
    ...(wgsl !== undefined ? { wgsl } : {}),
    ...(options.uniforms !== undefined ? { uniforms: options.uniforms } : {}),
    ...(options.uniformBlocks !== undefined ? { uniformBlocks: options.uniformBlocks } : {}),
  });
};

/**
 * A {@link Filter} that renders its input through a user-supplied shader, in
 * whichever language the active backend speaks.
 *
 * One filter carries both sources - GLSL for WebGL2, WGSL for WebGPU - on the
 * same {@link ShaderSource} contract materials use, and picks between them
 * internally. Supply both and the filter runs unchanged under
 * `backend: 'auto'`, where the engine decides which backend it gets.
 *
 * ## Usage
 *
 * ```ts
 * const filter = new ShaderFilter({
 *   glsl: {
 *     fragment: `#version 300 es
 *       precision mediump float;
 *       uniform sampler2D uTexture;
 *       uniform float uTime;
 *       in vec2 vUv;
 *       out vec4 fragColor;
 *       void main() {
 *         fragColor = texture(uTexture, vUv);
 *       }
 *     `,
 *   },
 *   wgsl: `
 *     struct Uniforms { uTime: f32 };
 *
 *     @group(0) @binding(1) var uTexture: texture_2d<f32>;
 *     @group(0) @binding(2) var uSampler: sampler;
 *     @group(1) @binding(0) var<uniform> uniforms: Uniforms;
 *
 *     @fragment
 *     fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
 *       return textureSample(uTexture, uSampler, vUv);
 *     }
 *   `,
 *   uniforms: { uTime: 0 },
 * });
 *
 * filter.setUniform('uTime', performance.now() / 1000);
 * sprite.filters = [filter];
 * ```
 *
 * ## Auto-bound entries
 *
 * Both languages receive the filter's input texture, the output dimensions and
 * the v-axis orientation, and both see a `vUv` varying running 0..1 across the
 * quad. Declare only the ones the source reads.
 *
 * ### GLSL
 *
 * ```glsl
 * uniform sampler2D uTexture;  // the filter's input, texture slot 0
 * uniform vec2 uResolution;    // output dimensions in texels
 * uniform float uOrientation;  // sign of the v axis against the effect domain
 * in vec2 vUv;
 * ```
 *
 * ### WGSL
 *
 * ```wgsl
 * @group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
 * @group(0) @binding(1) var uTexture: texture_2d<f32>;
 * @group(0) @binding(2) var uSampler: sampler;
 * @group(0) @binding(3) var<uniform> uOrientation: f32;
 * ```
 *
 * ## Sampling and the v axis
 *
 * `vUv` addresses the input in TEXEL space: sampling `uTexture` at `vUv`
 * reproduces the input unchanged, whatever the effect domain looks like. The
 * two backends store that domain the other way up, though - a WebGL2 render
 * texture bottom-up, a WebGPU one top-down - so `v` runs downwards through the
 * effect on one and upwards on the other.
 *
 * `uOrientation` is the sign that relates the two: `+1` where `v` grows ALONG
 * the effect domain's y axis (downwards) and `-1` where it grows against it.
 * Multiply the v component of any DIRECTIONAL offset by it and one source
 * behaves identically on both backends:
 *
 * ```glsl
 * // Read the texel `dy` below this one, on either backend.
 * vec4 below = texture(uTexture, vUv + vec2(0.0, dy * uOrientation));
 * ```
 *
 * Offsets that are not directional - a radial blur kernel, a symmetric
 * neighbourhood, anything that only recolours its own texel - need nothing.
 * The same sign also maps `vUv` onto a texture sampled ALONGSIDE the input
 * (a displacement or mask map, whose own row 0 is its top on both backends):
 * `0.5 + (vUv.y - 0.5) * uOrientation` is that texture's v.
 *
 * ## User uniforms
 *
 * Anything in {@link uniforms} is bound after the auto-binds. GLSL resolves them
 * by name, with texture uniforms claiming slots 1..N. WGSL packs every
 * non-texture uniform into one buffer at `@group(1) @binding(0)`, each in a
 * 16-byte slot **in declaration order**, and binds texture uniforms from
 * `@group(1) @binding(1)` onwards, each followed by its sampler.
 *
 * ## Missing sources
 *
 * A filter that carries only one language throws
 * {@link ShaderFilterBackendError} when it attaches to a backend speaking the
 * other one - before it compiles or allocates anything.
 * @stable
 */
export class ShaderFilter<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> extends Filter {
  /**
   * Build a filter from an existing {@link ShaderSource}, so one source can back
   * several filters. The source must already carry complete sources per language
   * - no default vertex stage is filled in.
   */
  public static from<F extends UniformFields | undefined, B extends UniformBlockRecord | undefined>(
    source: ShaderSource<F, B>,
    options?: Omit<ShaderFilterOptions<F, B>, 'shader' | 'glsl' | 'wgsl' | 'autoUpgrade'>,
  ): ShaderFilter<F, B> {
    return new ShaderFilter<F, B>({ shader: source, ...options });
  }

  private readonly _uniforms: Record<string, ShaderFilterUniformValue>;
  private readonly _shader: ShaderSource<F, B>;
  private readonly _bindings: ShaderFilterBindings;
  private readonly _uniformsView: unknown;
  private readonly _uniformBlocksView: unknown;

  private _glslPass: ShaderFilterPass | null = null;
  private _wgslPass: ShaderFilterPass | null = null;

  public constructor(options: ShaderFilterOptions<F, B> = {}) {
    super();

    // The inline-source form carries no declaration: `uniforms` means starting
    // values there, so only the source fields may reach the source factory.
    this._shader =
      options.shader ??
      (createFilterShaderSource({
        ...(options.glsl !== undefined ? { glsl: options.glsl } : {}),
        ...(options.wgsl !== undefined ? { wgsl: options.wgsl } : {}),
        ...(options.autoUpgrade !== undefined ? { autoUpgrade: options.autoUpgrade } : {}),
      }) as unknown as ShaderSource<F, B>);

    const schema = this._shader.uniformSchema;
    // A typed write reaches the GPU through the block's revision, but a cached
    // or retained representation of the owning node would keep replaying the
    // frame the old value produced unless the block reports the change too.
    const blocks = schema === null ? [] : createUniformBlockData(schema, () => this.invalidate());

    this._uniforms = schema === null ? { ...(options.uniforms as Record<string, ShaderFilterUniformValue> | undefined) } : {};
    this._bindings = { uniforms: this._uniforms, blocks, textures: { ...options.textures } };

    if (schema === null) {
      this._uniformsView = this._uniforms;
      this._uniformBlocksView = undefined;
    } else {
      applyInitialFilterValues(blocks, schema.implicit, options.uniforms, options.uniformBlocks);
      this._uniformsView = schema.implicit ? blocks[0]!.uniforms : undefined;
      this._uniformBlocksView = schema.implicit ? undefined : uniformBlockRecord(blocks);
    }
  }

  /** The source pair this filter runs, with the default stages already filled in. */
  public get shader(): ShaderSource<F, B> {
    return this._shader;
  }

  /**
   * The typed accessors of the declared uniform block, or - on a source without
   * a schema - the current uniform values, for reading.
   *
   * The untyped record is deliberately not writable: a value written straight
   * into it would reach the GPU on the next draw but tell nobody, so a cached or
   * retained representation of the owning node would keep replaying the frame
   * the old value produced. Write through {@link setUniform} / {@link setUniforms}.
   */
  public get uniforms(): ShaderFilterUniformsView<F, B> {
    return this._uniformsView as ShaderFilterUniformsView<F, B>;
  }

  /** The declared named uniform blocks, each owning its own values. */
  public get uniformBlocks(): ShaderFilterBlocksView<B> {
    return this._uniformBlocksView as ShaderFilterBlocksView<B>;
  }

  /** Whether this filter carries a source the given backend can run. */
  public supports(backendType: RenderBackendType): boolean {
    return backendType === RenderBackendType.WebGpu ? this._shader.wgsl !== null : this._shader.glsl !== null;
  }

  /**
   * Set one uniform and notify every node rendering this filter.
   *
   * Only available on a source that declares no uniform schema; a typed filter
   * writes through {@link uniforms} instead.
   */
  public setUniform(name: ShaderFilterRawUniformName<F, B>, value: ShaderFilterUniformValue): this {
    this._assertRawUniforms();
    this._uniforms[name as string] = value;
    this.invalidate();

    return this;
  }

  /** Set several uniforms, notifying once for the batch. */
  public setUniforms(values: Readonly<Record<string, ShaderFilterUniformValue>>): this {
    this._assertRawUniforms();

    for (const name of Object.keys(values)) {
      // In-bounds: `name` comes from `values`' own keys.
      this._uniforms[name] = values[name]!;
    }

    this.invalidate();

    return this;
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    this._attach(backend).apply(backend, input, output, resolution);
  }

  public override destroy(): void {
    super.destroy();

    this._glslPass?.destroy();
    this._wgslPass?.destroy();
    this._glslPass = null;
    this._wgslPass = null;

    for (const key of Object.keys(this._uniforms)) {
      delete this._uniforms[key];
    }
  }

  /**
   * Bind this filter to `backend`, building its per-language pass on the first
   * attachment and reusing it afterwards.
   *
   * The source check happens HERE rather than inside the pass body: it is the
   * earliest moment the filter knows which language is being asked of it, and it
   * runs before the pass compiles a program or allocates a buffer, so a filter
   * missing the active backend's source fails on attachment instead of leaking
   * half-built GPU state into a draw.
   *
   * A filter carrying both sources may be attached to both backends in turn -
   * each keeps its own pass.
   */
  private _attach(backend: RenderBackend): ShaderFilterPass {
    if (backend.backendType === RenderBackendType.WebGpu) {
      const wgsl = this._shader._resolveWgsl(filterUniformGroup);

      if (wgsl === null) {
        throw new ShaderFilterBackendError(RenderBackendType.WebGpu, 'wgsl');
      }

      return (this._wgslPass ??= new WebGpuShaderFilterPass(wgsl, this._bindings));
    }

    const glsl = this._shader._resolveGlsl();

    if (glsl === null) {
      throw new ShaderFilterBackendError(backend.backendType, 'glsl');
    }

    return (this._glslPass ??= new WebGl2ShaderFilterPass(glsl.vertex ?? defaultGlslVertexSource, glsl.fragment, this._bindings));
  }

  private _assertRawUniforms(): void {
    if (this._bindings.blocks.length > 0) {
      throw new Error('ShaderFilter.setUniform is not available on a shader source that declares uniforms; write through `filter.uniforms` instead.');
    }
  }
}

/** Write the caller's starting values into the freshly built blocks. */
const applyInitialFilterValues = (blocks: readonly UniformBlockData[], implicit: boolean, uniforms: unknown, uniformBlocks: unknown): void => {
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
