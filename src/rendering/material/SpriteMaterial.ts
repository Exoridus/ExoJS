import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import type { BlendModes } from '#rendering/types';
import type { UniformBlockRecord, UniformFields } from '#rendering/uniforms/uniformDeclarations';

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
export class SpriteMaterial<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> extends Material<F, B> {
  public readonly target = 'sprite';

  public constructor(options: MaterialOptions<F, B>) {
    super(options);
  }

  /**
   * Build a `SpriteMaterial` from an existing {@link ShaderSource}.
   * Equivalent to `new SpriteMaterial({ shader, ...options })`.
   */
  public static from<F extends UniformFields | undefined, B extends UniformBlockRecord | undefined>(
    source: ShaderSource<F, B>,
    options?: Omit<MaterialOptions<F, B>, 'shader'>,
  ): SpriteMaterial<F, B>;
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
    sourceOrGlslVertex: ShaderSource<UniformFields | undefined, UniformBlockRecord | undefined> | string,
    optionsOrGlslFragment?: Omit<MaterialOptions, 'shader'> | string,
    glslOptions?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
    },
  ): SpriteMaterial<UniformFields | undefined, UniformBlockRecord | undefined> {
    if (sourceOrGlslVertex instanceof ShaderSource) {
      const opts = optionsOrGlslFragment as Omit<MaterialOptions, 'shader'> | undefined;
      // The overloads above carry the real contract. Here the source's
      // declaration has been erased to "any of them", so the values that come
      // with it no longer describe one instantiation's uniforms.
      const options = { shader: sourceOrGlslVertex, ...(opts !== undefined ? opts : {}) } as unknown as MaterialOptions<
        UniformFields | undefined,
        UniformBlockRecord | undefined
      >;

      return new SpriteMaterial(options);
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

/**
 * A sprite material of any uniform schema - what a consumer that only needs to draw
 * with it should accept, since the bare class describes the untyped path.
 */
export type AnySpriteMaterial = SpriteMaterial<UniformFields | undefined, UniformBlockRecord | undefined>;
