import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import type { BlendModes } from '#rendering/types';

import type { MaterialOptions, UniformValue } from './Material';
import { Material } from './Material';
import { ShaderSource } from './ShaderSource';

/**
 * Material specialization for {@link Sprite} drawables.
 *
 * The base texture stays on the sprite and is sampled through the engine's
 * `sampleBase(slot, uv)` helper, which preserves batching and resolves the
 * backend's premultiplied-alpha convention. The material supplies the custom
 * fragment program, uniforms, additional texture bindings, and blend mode.
 * @advanced
 */
export class SpriteMaterial extends Material {
  public readonly target = 'sprite';

  public constructor(options: MaterialOptions) {
    super(options);
  }

  /**
   * Build a `SpriteMaterial` from an existing {@link ShaderSource}.
   * Equivalent to `new SpriteMaterial({ shader, ...options })`.
   */
  public static from(source: ShaderSource, options?: Omit<MaterialOptions, 'shader'>): SpriteMaterial;
  /**
   * Build a `SpriteMaterial` from raw GLSL vertex and fragment source strings.
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
  ): SpriteMaterial;
  public static from(
    sourceOrGlslVertex: ShaderSource | string,
    optionsOrGlslFragment?: Omit<MaterialOptions, 'shader'> | string,
    glslOptions?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
    },
  ): SpriteMaterial {
    if (sourceOrGlslVertex instanceof ShaderSource) {
      const opts = optionsOrGlslFragment as Omit<MaterialOptions, 'shader'> | undefined;
      return new SpriteMaterial({ shader: sourceOrGlslVertex, ...(opts !== undefined ? opts : {}) });
    }

    const shader = new ShaderSource({
      glsl: { vertex: sourceOrGlslVertex, fragment: optionsOrGlslFragment as string },
      ...(glslOptions?.wgsl !== undefined ? { wgsl: glslOptions.wgsl } : {}),
    });

    return new SpriteMaterial({
      shader,
      ...(glslOptions?.uniforms !== undefined ? { uniforms: glslOptions.uniforms } : {}),
      ...(glslOptions?.blendMode !== undefined ? { blendMode: glslOptions.blendMode } : {}),
      ...(glslOptions?.sampler !== undefined ? { sampler: glslOptions.sampler } : {}),
    });
  }
}
