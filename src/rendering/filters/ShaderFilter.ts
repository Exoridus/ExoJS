import { ShaderSource } from '#rendering/material/ShaderSource';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { upgradeFragmentShaderToGl300 } from '#rendering/shader/upgradeFragmentShaderToGl300';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import { Filter } from './Filter';
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

/** Construction options for a {@link ShaderFilter}. */
export interface ShaderFilterOptions extends ShaderFilterSourceOptions {
  /**
   * A ready-made source pair, the way {@link Material} takes one. Takes the
   * place of {@link ShaderFilterSourceOptions.glsl}/{@link ShaderFilterSourceOptions.wgsl}
   * and is used verbatim - no default vertex stage is filled in, and no GLSL
   * upgrade is run.
   */
  readonly shader?: ShaderSource;

  /**
   * Initial uniform values. Update them at runtime through
   * {@link ShaderFilter.setUniform} / {@link ShaderFilter.setUniforms}, which
   * also invalidate the nodes rendering the filter.
   */
  readonly uniforms?: Record<string, ShaderFilterUniformValue>;
}

/**
 * A {@link ShaderFilter} was applied on a backend it carries no source for.
 *
 * Thrown when the filter first attaches to a backend - before any program,
 * pipeline or buffer is created - so a WGSL-less filter fails the moment a
 * WebGPU backend touches it rather than somewhere inside a draw.
 */
export class ShaderFilterBackendError extends Error {
  /** Backend the filter was attached to. */
  public readonly backendType: RenderBackendType;
  /** Language that backend needs and the filter does not carry. */
  public readonly missingLanguage: ShaderFilterLanguage;

  public constructor(backendType: RenderBackendType, missingLanguage: ShaderFilterLanguage) {
    super(
      `ShaderFilter carries no ${missingLanguage.toUpperCase()} source, which the active ${backendType === RenderBackendType.WebGpu ? 'WebGPU' : 'WebGL2'} backend requires. ` +
        `Pass \`${missingLanguage}\` alongside the source you already supply — with \`backend: 'auto'\` either backend can end up active.`,
    );

    this.name = 'ShaderFilterBackendError';
    this.backendType = backendType;
    this.missingLanguage = missingLanguage;
  }
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
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/** Prepend the default vertex stage to a module that declares none. */
function withWgslVertexStage(source: string): string {
  return wgslVertexStagePattern.test(stripComments(source)) ? source : `${defaultWgslVertexSource}\n${source}`;
}

/**
 * Build the {@link ShaderSource} behind a filter pass: fills in the default
 * vertex stage per language, and upgrades legacy GLSL when asked.
 *
 * Shared with the stock filters so their sources are the same objects the
 * structural parity checks read.
 * @internal
 */
export function createFilterShaderSource(options: ShaderFilterSourceOptions): ShaderSource {
  const autoUpgrade = options.autoUpgrade !== false;
  const glsl =
    options.glsl !== undefined
      ? {
          vertex: options.glsl.vertex ?? defaultGlslVertexSource,
          fragment: autoUpgrade ? upgradeFragmentShaderToGl300(options.glsl.fragment) : options.glsl.fragment,
        }
      : undefined;
  const wgsl = options.wgsl !== undefined ? withWgslVertexStage(options.wgsl) : undefined;

  return new ShaderSource({
    ...(glsl !== undefined ? { glsl } : {}),
    ...(wgsl !== undefined ? { wgsl } : {}),
  });
}

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
 * Both languages receive the filter's input texture and the output dimensions,
 * and both see a `vUv` varying running 0..1 across the quad.
 *
 * ### GLSL
 *
 * ```glsl
 * uniform sampler2D uTexture;  // the filter's input, texture slot 0
 * uniform vec2 uResolution;    // output dimensions in texels
 * in vec2 vUv;
 * ```
 *
 * ### WGSL
 *
 * ```wgsl
 * @group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
 * @group(0) @binding(1) var uTexture: texture_2d<f32>;
 * @group(0) @binding(2) var uSampler: sampler;
 * ```
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
export class ShaderFilter extends Filter {
  /**
   * Build a filter from an existing {@link ShaderSource}, so one source can back
   * several filters. The source must already carry complete sources per language
   * - no default vertex stage is filled in.
   */
  public static from(source: ShaderSource, options?: { readonly uniforms?: Record<string, ShaderFilterUniformValue> }): ShaderFilter {
    return new ShaderFilter({ shader: source, ...(options?.uniforms !== undefined ? { uniforms: options.uniforms } : {}) });
  }

  private readonly _uniforms: Record<string, ShaderFilterUniformValue>;
  private readonly _shader: ShaderSource;

  private _glslPass: ShaderFilterPass | null = null;
  private _wgslPass: ShaderFilterPass | null = null;

  public constructor(options: ShaderFilterOptions = {}) {
    super();

    this._shader = options.shader ?? createFilterShaderSource(options);
    this._uniforms = { ...(options.uniforms ?? {}) };
  }

  /** The source pair this filter runs, with the default stages already filled in. */
  public get shader(): ShaderSource {
    return this._shader;
  }

  /**
   * The current uniform values, for reading.
   *
   * Deliberately not writable: a value written straight into this record would
   * reach the GPU on the next draw but tell nobody, so a cached or retained
   * representation of the owning node would keep replaying the frame the old
   * value produced. Write through {@link setUniform} / {@link setUniforms}.
   */
  public get uniforms(): Readonly<Record<string, ShaderFilterUniformValue>> {
    return this._uniforms;
  }

  /** Whether this filter carries a source the given backend can run. */
  public supports(backendType: RenderBackendType): boolean {
    return backendType === RenderBackendType.WebGpu ? this._shader.wgsl !== null : this._shader.glsl !== null;
  }

  /** Set one uniform and notify every node rendering this filter. */
  public setUniform(name: string, value: ShaderFilterUniformValue): this {
    this._uniforms[name] = value;
    this.invalidate();

    return this;
  }

  /** Set several uniforms, notifying once for the batch. */
  public setUniforms(values: Readonly<Record<string, ShaderFilterUniformValue>>): this {
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
      if (this._shader.wgsl === null) {
        throw new ShaderFilterBackendError(RenderBackendType.WebGpu, 'wgsl');
      }

      return (this._wgslPass ??= new WebGpuShaderFilterPass(this._shader.wgsl, this._uniforms));
    }

    if (this._shader.glsl === null) {
      throw new ShaderFilterBackendError(backend.backendType, 'glsl');
    }

    return (this._glslPass ??= new WebGl2ShaderFilterPass(this._shader.glsl.vertex, this._shader.glsl.fragment, this._uniforms));
  }
}
