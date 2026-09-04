/**
 * Construction options for {@link ShaderSource}.
 *
 * At least one language must be supplied. Provide `glsl` for WebGL2,
 * `wgsl` for WebGPU, or both for backend-portable materials. The source
 * is compiled lazily on first use against the active backend; an
 * unsupported backend at draw time throws with a clear error.
 */
export interface ShaderSourceOptions {
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

let nextShaderSourceId = 1;

/**
 * Immutable shader source pair shared by {@link Material} instances.
 *
 * `ShaderSource` owns only the GLSL/WGSL text and its stable identity;
 * it carries no uniform/texture state (that lives on the {@link Material}).
 * One `ShaderSource` can back many materials, and renderers key their
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
 * # User uniforms
 *
 * Anything in {@link Material.uniforms} is set after the auto-binds.
 * `Texture`/`RenderTexture` values claim slots 1..N (slot 0 belongs to the
 * drawable's own texture).
 *
 * ## WGSL user-uniform contract
 *
 * User uniforms live in `@group(2)`:
 *
 * - `@group(2) @binding(0) var<uniform> u_user: <UserUniformsStruct>;`
 *   for the packed scalar/vector/matrix uniforms.
 * - `@group(2) @binding(N)` for each `Texture`/`RenderTexture` uniform,
 *   in declaration order, alongside its sampler at `@binding(N+1)`.
 * @advanced
 */
export class ShaderSource {
  /**
   * GLSL sources for the WebGL2 backend, or `null` if not provided. `vertex`
   * is `null` when the author left the vertex stage to the consumer.
   */
  public readonly glsl: { readonly vertex: string | null; readonly fragment: string } | null;

  /** WGSL source for the WebGPU backend, or `null` if not provided. */
  public readonly wgsl: string | null;

  private readonly _id: number;

  public constructor(options: ShaderSourceOptions) {
    if (options.glsl === undefined && options.wgsl === undefined) {
      throw new Error('ShaderSource requires at least one of `glsl` or `wgsl`.');
    }

    if (options.glsl !== undefined) {
      if (options.glsl.vertex !== undefined && (typeof options.glsl.vertex !== 'string' || options.glsl.vertex.length === 0)) {
        throw new Error('ShaderSource.glsl.vertex must be a non-empty string when provided.');
      }
      if (typeof options.glsl.fragment !== 'string' || options.glsl.fragment.length === 0) {
        throw new Error('ShaderSource.glsl.fragment must be a non-empty string.');
      }
    }

    if (options.wgsl !== undefined && (typeof options.wgsl !== 'string' || options.wgsl.length === 0)) {
      throw new Error('ShaderSource.wgsl must be a non-empty string.');
    }

    this.glsl = options.glsl !== undefined ? { vertex: options.glsl.vertex ?? null, fragment: options.glsl.fragment } : null;
    this.wgsl = options.wgsl ?? null;
    this._id = nextShaderSourceId++;
  }

  /**
   * Stable per-instance identity. Identical `id` ⇒ same compiled program/
   * pipeline can be reused. Monotonic across the session; never reused.
   */
  public get id(): number {
    return this._id;
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
   * Best-effort count of the color attachments each language's fragment stage
   * writes, from its declared outputs - `null` for a language not supplied.
   * Parsed via the same lightweight regex approach as {@link getDeclaredUniforms},
   * not a full grammar: intended for an early dev-build warning when a
   * material is drawn into a multi-attachment target it cannot fully satisfy,
   * not for driving pipeline creation.
   */
  public countFragmentOutputs(): { glsl: number | null; wgsl: number | null } {
    return {
      glsl: this.glsl !== null ? countGlslFragmentOutputs(this.glsl.fragment) : null,
      wgsl: this.wgsl !== null ? countWgslFragmentOutputs(this.wgsl) : null,
    };
  }
}

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

const countGlslFragmentOutputs = (fragmentSource: string): number => {
  const stripped = stripComments(fragmentSource);
  const matches = stripped.match(glslFragmentOutputPattern);

  return matches !== null ? matches.length : 0;
};

// Captures the fragment entry point's return-type clause, up to its body.
const wgslFragmentEntryPattern = /@fragment\s+fn\s+\w+\s*\([^)]*\)\s*->\s*([^{]+)\{/;
const wgslLocationPattern = /@location\(\s*\d+\s*\)/g;

/**
 * `null` when the source declares no `@fragment` entry point at all (a
 * vertex-only or compute-only module) - distinct from `0`, which would
 * incorrectly read as "declares zero outputs".
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

  return locations !== null ? locations.length : 0;
};
