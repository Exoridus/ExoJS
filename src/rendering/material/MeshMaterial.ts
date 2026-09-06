import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import type { BlendModes } from '#rendering/types';
import type { UniformBlockRecord, UniformFields } from '#rendering/uniforms/uniformDeclarations';

import type { MaterialOptions, UniformValue } from './Material';
import { Material } from './Material';
import { ShaderSource } from './ShaderSource';

/**
 * Material specialization for {@link Mesh} drawables.
 *
 * Carries the mesh contract conceptually: fixed vertex attribute locations
 * (0 = position, 1 = texcoord, 2 = color), the auto-bound uniforms
 * `u_projection`/`u_translation`/`u_tint`/`u_texture`, and the WGSL
 * group(0)=mesh-uniforms / group(1)=texture / group(2)=user binding scheme.
 * Renderer wiring is added in a later phase.
 * @advanced
 */
export class MeshMaterial<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> extends Material<F, B> {
  public readonly target = 'mesh';

  public constructor(options: MaterialOptions<F, B>) {
    super(options);
  }

  /**
   * Build a `MeshMaterial` from an existing {@link ShaderSource}.
   * Equivalent to `new MeshMaterial({ shader, ...options })`.
   */
  public static from<F extends UniformFields | undefined, B extends UniformBlockRecord | undefined>(
    source: ShaderSource<F, B>,
    options?: Omit<MaterialOptions<F, B>, 'shader'>,
  ): MeshMaterial<F, B>;
  /**
   * Build a `MeshMaterial` from raw GLSL vertex and fragment source strings.
   * Wraps them in a new {@link ShaderSource}; pass `options.wgsl` to also
   * cover the WebGPU backend.
   */
  public static from(
    glslVertex: string,
    glslFragment: string,
    options?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
    },
  ): MeshMaterial;
  public static from(
    sourceOrGlslVertex: ShaderSource<UniformFields | undefined, UniformBlockRecord | undefined> | string,
    optionsOrGlslFragment?: Omit<MaterialOptions, 'shader'> | string,
    glslOptions?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
    },
  ): MeshMaterial<UniformFields | undefined, UniformBlockRecord | undefined> {
    if (sourceOrGlslVertex instanceof ShaderSource) {
      const opts = optionsOrGlslFragment as Omit<MaterialOptions, 'shader'> | undefined;
      // The overloads above carry the real contract. Here the source's
      // declaration has been erased to "any of them", so the values that come
      // with it no longer describe one instantiation's uniforms.
      const options = { shader: sourceOrGlslVertex, ...(opts !== undefined ? opts : {}) } as unknown as MaterialOptions<
        UniformFields | undefined,
        UniformBlockRecord | undefined
      >;

      return new MeshMaterial(options);
    }

    const shader = new ShaderSource({
      glsl: { vertex: sourceOrGlslVertex, fragment: optionsOrGlslFragment as string },
      ...(glslOptions?.wgsl !== undefined ? { wgsl: glslOptions.wgsl } : {}),
    });

    return new MeshMaterial({
      shader,
      ...(glslOptions?.uniforms !== undefined ? { uniforms: glslOptions.uniforms } : {}),
      ...(glslOptions?.blendMode !== undefined ? { blendMode: glslOptions.blendMode } : {}),
      ...(glslOptions?.sampler !== undefined ? { sampler: glslOptions.sampler } : {}),
    });
  }
}

/**
 * A mesh material of any uniform schema - what a consumer that only needs to draw
 * with it should accept, since the bare class describes the untyped path.
 */
export type AnyMeshMaterial = MeshMaterial<UniformFields | undefined, UniformBlockRecord | undefined>;
