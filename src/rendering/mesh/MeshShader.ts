import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { Texture } from '@/rendering/texture/Texture';

/**
 * Uniform value passed to a custom mesh shader. Scalars and small tuples
 * auto-marshal to the appropriate `Float32Array`/`Int32Array` for the
 * backend's uniform call. `Texture`/`RenderTexture` values are bound to
 * texture slots starting at slot 1 — slot 0 is reserved for the mesh's
 * own `texture`.
 */
export type MeshShaderUniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | Int32Array
  | Texture
  | RenderTexture;

/**
 * Construction options for {@link MeshShader}.
 *
 * At least one language must be supplied. Provide `glsl` for WebGL2,
 * `wgsl` for WebGPU, or both for backend-portable meshes. The shader
 * is compiled lazily on first use against the active backend; an
 * unsupported backend at draw time throws with a clear error.
 */
export interface MeshShaderOptions {
  /**
   * GLSL ES 3.00 sources for the WebGL2 backend. Both `vertex` and
   * `fragment` are required when `glsl` is supplied.
   */
  readonly glsl?: {
    readonly vertex: string;
    readonly fragment: string;
  };

  /**
   * WGSL source for the WebGPU backend. Vertex and fragment entry
   * points live in the same source file (WGSL convention).
   */
  readonly wgsl?: string;

  /** Initial uniform values; mutate per frame via {@link MeshShader.uniforms}. */
  readonly uniforms?: Record<string, MeshShaderUniformValue>;
}

/**
 * Custom shader pair attached to a {@link Mesh}.
 *
 * One `MeshShader` instance can be shared across many meshes; renderers
 * cache compiled programs/pipelines on the instance reference. Call
 * {@link destroy} when the shader is no longer needed to release the
 * cached GPU resources on every backend the shader was used on.
 *
 * # Vertex layout
 *
 * The vertex layout is fixed and shared with the default mesh shader,
 * so custom vertex shaders MUST pin the standard attribute locations:
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
 * The renderer auto-binds these when the shader declares them. Declared
 * but unused is fine; absent is fine too. Both backends carry the same
 * logical uniforms, only the binding scheme differs.
 *
 * ## GLSL
 *
 * ```glsl
 * uniform mat3 u_projection;   // active view's projection
 * uniform mat3 u_translation;  // mesh's global transform
 * uniform vec4 u_tint;         // mesh.tint as RGBA in 0..1
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
 * Anything in {@link uniforms} is set after the auto-binds. `Texture`/
 * `RenderTexture` values claim slots 1..N (slot 0 belongs to the mesh).
 *
 * ## WGSL user-uniform contract
 *
 * User uniforms live in `@group(2)`:
 *
 * - `@group(2) @binding(0) var<uniform> u_user: <UserUniformsStruct>;`
 *   for the packed scalar/vector/matrix uniforms.
 * - `@group(2) @binding(N)` for each `Texture`/`RenderTexture` uniform,
 *   in declaration order, alongside its sampler at `@binding(N+1)`.
 */
export class MeshShader {
  /**
   * Mutable user uniform values. Mutate between frames to drive animated
   * effects; the renderer reads from this map every draw.
   *
   *   shader.uniforms.uTime = performance.now() / 1000;
   *   shader.uniforms.uColor = [1, 0.5, 0, 1];
   */
  public uniforms: Record<string, MeshShaderUniformValue>;

  /** GLSL source pair for the WebGL2 backend, or `null` if not provided. */
  public readonly glsl: { readonly vertex: string; readonly fragment: string } | null;

  /** WGSL source for the WebGPU backend, or `null` if not provided. */
  public readonly wgsl: string | null;

  private readonly _disposeCallbacks = new Set<() => void>();

  public constructor(options: MeshShaderOptions) {
    if (options.glsl === undefined && options.wgsl === undefined) {
      throw new Error('MeshShader requires at least one of `glsl` or `wgsl`.');
    }

    if (options.glsl !== undefined) {
      if (typeof options.glsl.vertex !== 'string' || options.glsl.vertex.length === 0) {
        throw new Error('MeshShader.glsl.vertex must be a non-empty string.');
      }
      if (typeof options.glsl.fragment !== 'string' || options.glsl.fragment.length === 0) {
        throw new Error('MeshShader.glsl.fragment must be a non-empty string.');
      }
    }

    if (options.wgsl !== undefined && (typeof options.wgsl !== 'string' || options.wgsl.length === 0)) {
      throw new Error('MeshShader.wgsl must be a non-empty string.');
    }

    this.glsl = options.glsl ?? null;
    this.wgsl = options.wgsl ?? null;
    this.uniforms = { ...(options.uniforms ?? {}) };
  }

  /**
   * Convenience setter equivalent to `shader.uniforms[name] = value`.
   * Provided for symmetry with engine APIs that prefer explicit methods
   * over property mutation.
   */
  public setUniform(name: string, value: MeshShaderUniformValue): void {
    this.uniforms[name] = value;
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
   * NOT consult this map; they bind uniforms by name from {@link uniforms}
   * and let the underlying API resolve declared-but-unused entries.
   */
  public getDeclaredUniforms(): { glsl: Record<string, string>; wgsl: Record<string, string> } {
    return {
      glsl: this.glsl !== null ? parseGlslUniforms(this.glsl.vertex, this.glsl.fragment) : {},
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
   * Release GPU resources cached against this `MeshShader` on every
   * backend that has compiled it. Safe to call multiple times. After
   * destroy, the shader can still be re-used — renderers will recompile
   * on next draw — but typical usage is to drop the reference.
   */
  public destroy(): void {
    for (const callback of this._disposeCallbacks) {
      callback();
    }
    this._disposeCallbacks.clear();
  }

  /**
   * Internal hook for renderers to register a per-shader-instance cleanup
   * callback (release compiled program, pipeline, or bind groups). The
   * callback fires on {@link destroy}; renderers MUST also tolerate the
   * shader being garbage-collected without destroy ever being called.
   *
   * @internal
   */
  public _onDispose(callback: () => void): void {
    this._disposeCallbacks.add(callback);
  }
}

const autoBoundUniformNames = new Set<string>(['u_projection', 'u_translation', 'u_tint', 'u_texture', 'u_mesh']);

const glslUniformPattern = /\buniform\s+(?:mediump\s+|highp\s+|lowp\s+|)(\w+)\s+(\w+)[^;]*;/g;

const wgslUserUniformPattern = /@group\(\s*2\s*\)\s*@binding\(\s*\d+\s*\)\s*var(?:<[^>]+>|)\s+(\w+)\s*:\s*([^;]+);/g;

/**
 * Strip line and block comments from a shader source so the uniform
 * regexes don't match commented-out declarations. Conservative: works
 * for both GLSL and WGSL syntax (both use `//` and `/* ... *\/`).
 */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

function parseGlslUniforms(vertex: string, fragment: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of [vertex, fragment]) {
    const stripped = stripComments(source);
    glslUniformPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = glslUniformPattern.exec(stripped)) !== null) {
      const [, type, name] = match;
      result[name] = type;
    }
  }
  return result;
}

function parseWgslUniforms(source: string): Record<string, string> {
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
    result[name] = type.trim();
  }

  return result;
}
