import type { SamplerOptions } from '#rendering/texture/Sampler';
import type { BlendModes } from '#rendering/types';

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
export class MeshMaterial extends Material {
  public readonly target = 'mesh';

  public constructor(options: MaterialOptions) {
    super(options);
  }

  /**
   * Build a `MeshMaterial` from an existing {@link ShaderSource}.
   * Equivalent to `new MeshMaterial({ shader, ...options })`.
   */
  public static from(source: ShaderSource, options?: Omit<MaterialOptions, 'shader'>): MeshMaterial;
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
    sourceOrGlslVertex: ShaderSource | string,
    optionsOrGlslFragment?: Omit<MaterialOptions, 'shader'> | string,
    glslOptions?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
    },
  ): MeshMaterial {
    if (sourceOrGlslVertex instanceof ShaderSource) {
      const opts = optionsOrGlslFragment as Omit<MaterialOptions, 'shader'> | undefined;
      return new MeshMaterial({ shader: sourceOrGlslVertex, ...(opts !== undefined ? opts : {}) });
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
