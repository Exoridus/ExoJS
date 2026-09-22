import type { UniformBlockRecord, UniformFields } from '#rendering/uniforms/uniformDeclarations';
import type { UniformSchemaLayout } from '#rendering/uniforms/uniformLayout';
import type { UniformSchemaOptions } from '#rendering/uniforms/uniformSchema';
import { buildUniformSchemaLayout } from '#rendering/uniforms/uniformSchema';
import {
  generateGlslUniformDeclarations,
  generateWgslUniformDeclarations,
  withGlslUniformDeclarations,
  withWgslUniformDeclarations,
} from '#rendering/uniforms/uniformSource';

/**
 * Construction options for {@link Shader}.
 *
 * At least one language must be supplied. Provide `glsl` for WebGL2,
 * `wgsl` for WebGPU, or both for backend-portable materials. The source
 * is compiled lazily on first use against the active backend; an
 * unsupported backend at draw time throws with a clear error.
 */
export interface ShaderOptions<
  F extends UniformFields | undefined = undefined,
  B extends UniformBlockRecord | undefined = undefined,
> extends UniformSchemaOptions<F, B> {
  /**
   * GLSL ES 3.00 sources for the WebGL2 backend. `fragment` is required;
   * `vertex` may be omitted where the consumer owns the vertex stage - a
   * {@link SpriteMaterial} (the sprite vertex program is engine-owned) or a
   * {@link ShaderFilter} (the fullscreen quad). A mesh or particle material
   * needs both.
   */
  readonly glsl?: {
    readonly vertex?: string;
    readonly fragment: string;
  };

  /**
   * WGSL source for the WebGPU backend. Vertex and fragment entry
   * points live in the same source file (WGSL convention).
   */
  readonly wgsl?: string;
}

/**
 * Per-language count of the color attachments a fragment stage declares an
 * output for, as reflected from the shader source.
 *
 * `null` means the count could not be established - the language is not
 * supplied, or the source uses a shape the reflection cannot resolve - and
 * never means "declares none". Treat it as unknown rather than as a failed
 * requirement.
 */
export interface FragmentOutputCounts {
  /** Outputs declared by the GLSL fragment stage. */
  readonly glsl: number | null;
  /** Outputs declared by the WGSL fragment entry point. */
  readonly wgsl: number | null;
}

let nextShaderId = 1;

/**
 * Immutable shader source pair shared by {@link Material} instances.
 *
 * `Shader` owns only the GLSL/WGSL text and its stable identity;
 * it carries no uniform/texture state (that lives on the {@link Material}).
 * One `Shader` can back many materials, and renderers key their
 * compiled program/pipeline caches on the source identity exposed via
 * {@link id}.
 *
 * # Vertex layout
 *
 * The vertex layout for the mesh path is fixed and shared with the default
 * mesh material, so custom vertex shaders MUST pin the standard attribute
 * locations:
 *
 * ## GLSL (location-qualified)
 *
 * ```glsl
 * layout(location = 0) in vec2 a_position;
 * layout(location = 1) in vec2 a_texcoord;
 * layout(location = 2) in vec4 a_color;
 * ```
 *
 * ## WGSL (location-qualified)
 *
 * ```wgsl
 * struct VertexInput {
 *     @location(0) position: vec2<f32>,
 *     @location(1) texcoord: vec2<f32>,
 *     @location(2) color: vec4<f32>,
 * };
 * ```
 *
 * # Auto-bound uniforms
 *
 * Renderers auto-bind these when the source declares them. Declared but
 * unused is fine; absent is fine too. Both backends carry the same logical
 * uniforms, only the binding scheme differs.
 *
 * ## GLSL
 *
 * ```glsl
 * uniform mat3 u_projection;   // active view's projection
 * uniform mat3 u_translation;  // drawable's global transform
 * uniform vec4 u_tint;         // tint as RGBA in 0..1
 * uniform sampler2D u_texture; // bound to texture slot 0
 * ```
 *
 * ## WGSL
 *
 * ```wgsl
 * struct MeshUniforms {
 *     projection: mat3x3<f32>,
 *     translation: mat3x3<f32>,
 *     tint: vec4<f32>,
 * };
 *
 * @group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;
 *
 * @group(1) @binding(0) var u_texture: texture_2d<f32>;
 * @group(1) @binding(1) var u_sampler: sampler;
 * ```
 *
 * # Declared user uniforms
 *
 * Supplying `uniforms` (one block) or `uniformBlocks` (several named ones)
 * makes this source the single source of truth for their names, types, layout
 * and defaults. The engine computes one canonical `std140` layout and prepends
 * the matching GLSL block and WGSL struct to the stages, so neither body
 * declares them; both read through the instance name - `uniforms` for the
 * implicit block, the record key for a named one.
 *
 * ```ts
 * const shader = new Shader({
 *     uniforms: { u_time: UniformType.Float, u_tint: UniformType.Vec4 },
 *     glsl: { vertex, fragment },
 *     wgsl,
 * });
 * ```
 *
 * Materials and filters built on such a source expose typed accessors instead
 * of the value record, and textures are declared in `textures` rather than
 * among the uniforms. Blocks take bindings `0..n-1` of the consumer's user bind
 * group in declaration order, with texture bindings following after them.
 *
 * # Raw user uniforms
 *
 * Without a declaration the source keeps full control and correspondingly
 * weaker guarantees. Anything in {@link Material.uniforms} is set after the
 * auto-binds, and `Texture`/`RenderTexture` values claim slots 1..N (slot 0
 * belongs to the drawable's own texture).
 *
 * ## WGSL user-uniform contract
 *
 * User uniforms live in `@group(2)`:
 *
 * - `@group(2) @binding(0) var<uniform> u_user: <UserUniformsStruct>;`
 *   for the packed scalar/vector/matrix uniforms, each in its own 16-byte slot
 *   in declaration order.
 * - `@group(2) @binding(N)` for each `Texture`/`RenderTexture` uniform,
 *   in declaration order, alongside its sampler at `@binding(N+1)`.
 * @advanced
 */
export class Shader<const F extends UniformFields | undefined = undefined, const B extends UniformBlockRecord | undefined = undefined> {
  /**
   * GLSL sources for the WebGL2 backend, or `null` if not provided. `vertex`
   * is `null` when the author left the vertex stage to the consumer.
   */
  public readonly glsl: { readonly vertex: string | null; readonly fragment: string } | null;

  /** WGSL source for the WebGPU backend, or `null` if not provided. */
  public readonly wgsl: string | null;

  /**
   * The canonical layout of the declared uniform blocks, or `null` for a source
   * that manages its own uniform declarations.
   */
  public readonly uniformSchema: UniformSchemaLayout | null;

  /** The implicit block's field declaration, as supplied. */
  public readonly uniforms: F;

  /** The named block declarations, as supplied. */
  public readonly uniformBlocks: B;

  private readonly _id: number;
  private readonly _glslDeclarations: string | null;
  private readonly _wgslByGroup = new Map<number, string>();
  private _resolvedGlsl: { readonly vertex: string | null; readonly fragment: string } | null = null;
  private _fragmentOutputs: FragmentOutputCounts | null = null;

  public constructor(options: ShaderOptions<F, B>) {
    if (options.glsl === undefined && options.wgsl === undefined) {
      throw new Error('Shader requires at least one of `glsl` or `wgsl`.');
    }

    if (options.glsl !== undefined) {
      if (options.glsl.vertex !== undefined && (typeof options.glsl.vertex !== 'string' || options.glsl.vertex.length === 0)) {
        throw new Error('Shader.glsl.vertex must be a non-empty string when provided.');
      }
      if (typeof options.glsl.fragment !== 'string' || options.glsl.fragment.length === 0) {
        throw new Error('Shader.glsl.fragment must be a non-empty string.');
      }
    }

    if (options.wgsl !== undefined && (typeof options.wgsl !== 'string' || options.wgsl.length === 0)) {
      throw new Error('Shader.wgsl must be a non-empty string.');
    }

    this.glsl = options.glsl !== undefined ? { vertex: options.glsl.vertex ?? null, fragment: options.glsl.fragment } : null;
    this.wgsl = options.wgsl ?? null;
    this.uniforms = options.uniforms as F;
    this.uniformBlocks = options.uniformBlocks as B;
    this.uniformSchema = buildUniformSchemaLayout(options.uniforms, options.uniformBlocks);
    this._glslDeclarations = this.uniformSchema !== null ? generateGlslUniformDeclarations(this.uniformSchema) : null;
    this._id = nextShaderId++;
  }

  /**
   * Stable per-instance identity. Identical `id` ⇒ same compiled program/
   * pipeline can be reused. Monotonic across the session; never reused.
   */
  public get id(): number {
    return this._id;
  }

  /**
   * The GLSL a backend compiles: {@link glsl} with the declared uniform blocks
   * prepended, or {@link glsl} verbatim for a source without a schema. The
   * declarations are inserted after the leading `#version`/`#extension` run.
   * @internal
   */
  public _resolveGlsl(): { readonly vertex: string | null; readonly fragment: string } | null {
    if (this.glsl === null) {
      return null;
    }

    if (this._glslDeclarations === null) {
      return this.glsl;
    }

    this._resolvedGlsl ??= {
      vertex: this.glsl.vertex !== null ? withGlslUniformDeclarations(this.glsl.vertex, this._glslDeclarations) : null,
      fragment: withGlslUniformDeclarations(this.glsl.fragment, this._glslDeclarations),
    };

    return this._resolvedGlsl;
  }

  /**
   * The WGSL a backend compiles, with the declared blocks bound in `group`.
   *
   * The group is the consumer's, not the source's: a material's user uniforms
   * live in `@group(2)` and a filter's in `@group(1)`, and the same source can
   * legitimately be compiled for either.
   * @internal
   */
  public _resolveWgsl(group: number): string | null {
    if (this.wgsl === null) {
      return null;
    }

    if (this.uniformSchema === null) {
      return this.wgsl;
    }

    let resolved = this._wgslByGroup.get(group);

    if (resolved === undefined) {
      resolved = withWgslUniformDeclarations(this.wgsl, generateWgslUniformDeclarations(this.uniformSchema, group));
      this._wgslByGroup.set(group, resolved);
    }

    return resolved;
  }

  /**
   * Reflect declared uniforms from each language's source. Returns a per-
   * language map of uniform-name → declared type, parsed from the shader
   * sources via lightweight regex (not a full GLSL/WGSL grammar). Texture
   * uniforms (`sampler2D`/`texture_2d`) are included; sampler bindings
   * are not (they pair with textures by binding index).
   *
   * Reflection is best-effort and intended for CI drift-checks and editor
   * tooling, not for runtime uniform binding decisions. The renderers do
   * NOT consult this map; they bind uniforms by name from
   * {@link Material.uniforms} and let the underlying API resolve declared-
   * but-unused entries.
   */
  public getDeclaredUniforms(): { glsl: Record<string, string>; wgsl: Record<string, string> } {
    return {
      glsl: this.glsl !== null ? parseGlslUniforms(this.glsl.vertex ?? '', this.glsl.fragment) : {},
      wgsl: this.wgsl !== null ? parseWgslUniforms(this.wgsl) : {},
    };
  }

  /**
   * Compare declared uniform names between the GLSL and WGSL sources.
   * Returns lists of names declared in only one language. Use in CI to
   * catch drift when both languages should expose the same logical
   * uniforms. When only one language is provided, returns empty arrays.
   *
   * Auto-bound uniforms (`u_projection`, `u_translation`, `u_tint`,
   * `u_texture`) are excluded from the comparison since the GLSL source
   * declares them at the top-level uniform scope while the WGSL source
   * receives them via the `@group(0)` mesh-uniforms struct and the
   * `@group(1)` texture binding.
   */
  public detectUniformDrift(): { onlyInGlsl: readonly string[]; onlyInWgsl: readonly string[] } {
    if (this.glsl === null || this.wgsl === null) {
      return { onlyInGlsl: [], onlyInWgsl: [] };
    }

    const declared = this.getDeclaredUniforms();
    const glslNames = new Set(Object.keys(declared.glsl).filter(n => !autoBoundUniformNames.has(n)));
    const wgslNames = new Set(Object.keys(declared.wgsl).filter(n => !autoBoundUniformNames.has(n)));

    const onlyInGlsl: string[] = [];
    const onlyInWgsl: string[] = [];

    for (const name of glslNames) {
      if (!wgslNames.has(name)) onlyInGlsl.push(name);
    }
    for (const name of wgslNames) {
      if (!glslNames.has(name)) onlyInWgsl.push(name);
    }

    return { onlyInGlsl, onlyInWgsl };
  }

  /**
   * How many color attachments each language's fragment stage declares an
   * output for, reflected from the source on first read and cached for the
   * shader's lifetime.
   *
   * Drawing into a multi-attachment render target needs one declared output
   * per attachment, and the engine refuses a draw whose count is known to fall
   * short. Reflection uses the same lightweight regex approach as
   * {@link getDeclaredUniforms} rather than a full grammar, so a source it
   * cannot resolve reports `null` and is let through rather than refused.
   */
  public get fragmentOutputs(): FragmentOutputCounts {
    this._fragmentOutputs ??= {
      glsl: this.glsl !== null ? countGlslFragmentOutputs(this.glsl.fragment) : null,
      wgsl: this.wgsl !== null ? countWgslFragmentOutputs(this.wgsl) : null,
    };

    return this._fragmentOutputs;
  }
}

/**
 * A shader source with any uniform declaration - what a consumer that only
 * reads its text should accept, since the bare class describes a source that
 * declares none.
 */
export type AnyShader = Shader<UniformFields | undefined, UniformBlockRecord | undefined>;

const autoBoundUniformNames = new Set<string>(['u_projection', 'u_translation', 'u_tint', 'u_texture', 'u_mesh']);

const glslUniformPattern = /\buniform\s+(?:mediump\s+|highp\s+|lowp\s+|)(\w+)\s+(\w+)[^;]*;/g;

const wgslUserUniformPattern = /@group\(\s*2\s*\)\s*@binding\(\s*\d+\s*\)\s*var(?:<[^>]+>|)\s+(\w+)\s*:\s*([^;]+);/g;

/**
 * Strip line and block comments from a shader source so the uniform
 * regexes don't match commented-out declarations. Conservative: works
 * for both GLSL and WGSL syntax (both use `//` and block comments).
 */
const stripComments = (source: string): string => source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');

const parseGlslUniforms = (vertex: string, fragment: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const source of [vertex, fragment]) {
    const stripped = stripComments(source);
    glslUniformPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = glslUniformPattern.exec(stripped)) !== null) {
      const [, type, name] = match;
      if (type === undefined || name === undefined) {
        continue;
      }
      result[name] = type;
    }
  }
  return result;
};

const parseWgslUniforms = (source: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const stripped = stripComments(source);

  // User uniforms in @group(2). Each user-uniform binding is either:
  //   - var<uniform> u_user: SomeStruct;
  //   - var u_extraTex: texture_2d<f32>;
  // We extract the name and the (trimmed) type expression.
  wgslUserUniformPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = wgslUserUniformPattern.exec(stripped)) !== null) {
    const [, name, type] = match;
    if (name === undefined || type === undefined) {
      continue;
    }
    result[name] = type.trim();
  }

  return result;
};

// Matches a GLSL ES 3.00 fragment output declaration, with or without a
// preceding `layout(location = n)` qualifier - a single unqualified `out`
// (implicit location 0) is exactly as valid as an explicit one, and a
// multi-output shader needs the qualifier on every entry but this one, so
// counting the `out` declarations themselves (not just the qualified ones)
// is what generalizes to both shapes.
// The `\s+`/`[A-Za-z_]\w*` groups match disjoint character classes in a fixed
// sequence, so there is no ambiguous backtracking; the linter's static
// heuristic flags any regex with two quantified word/space groups in a row
// regardless, with no way to see that.
// eslint-disable-next-line security/detect-unsafe-regex
const glslFragmentOutputPattern = /\bout\s+(?:(?:mediump|highp|lowp)\s+)?[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*;/g;

/**
 * `null` when no `out` declaration matched. A fragment stage that writes a
 * color has at least one, so a zero count means the regex missed the shape
 * rather than that the source declares nothing - and the difference decides
 * whether the multi-attachment guard refuses a draw or lets it through.
 */
const countGlslFragmentOutputs = (fragmentSource: string): number | null => {
  const stripped = stripComments(fragmentSource);
  const matches = stripped.match(glslFragmentOutputPattern);

  return matches !== null && matches.length > 0 ? matches.length : null;
};

// Captures the fragment entry point's return-type clause, up to its body.
const wgslFragmentEntryPattern = /@fragment\s+fn\s+\w+\s*\([^)]*\)\s*->\s*([^{]+)\{/;
const wgslLocationPattern = /@location\(\s*\d+\s*\)/g;

/**
 * `null` for a source whose fragment outputs cannot be established: no
 * `@fragment` entry point at all (a vertex-only or compute-only module), a
 * return type that does not resolve to a struct declaration in the same
 * source, or a struct carrying no `@location` field - the last being a
 * fragment stage that writes only builtins, which the multi-attachment guard
 * is not the right place to diagnose.
 */
const countWgslFragmentOutputs = (source: string): number | null => {
  const stripped = stripComments(source);
  const entryMatch = wgslFragmentEntryPattern.exec(stripped);

  if (entryMatch === null) {
    return null;
  }

  const returnType = entryMatch[1]!.trim();

  // A single output writes its `@location` directly on the return type
  // instead of through a struct: `-> @location(0) vec4<f32>`.
  if (returnType.startsWith('@location(')) {
    return 1;
  }

  const structMatch = new RegExp(`struct\\s+${returnType}\\s*\\{([^}]*)\\}`).exec(stripped);

  if (structMatch === null) {
    return null;
  }

  const locations = structMatch[1]!.match(wgslLocationPattern);

  return locations !== null && locations.length > 0 ? locations.length : null;
};
