import { Shader } from '#rendering/shader/Shader';
import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import type { BlendModes } from '#rendering/types';
import type { UniformBlockRecord, UniformFields } from '#rendering/uniforms/uniformDeclarations';

import type { MaterialOptions, UniformValue } from './Material';
import { Material } from './Material';

/**
 * Material specialization for {@link Sprite} drawables.
 *
 * The base texture stays on the sprite and is sampled through the engine's
 * `sampleBase(slot, uv)` helper, which preserves batching and resolves the
 * backend's premultiplied-alpha convention. The material supplies the custom
 * fragment program, uniforms, additional texture bindings, and blend mode.
 *
 * `sampleBase` already returns a hardware-decoded, associated (premultiplied)
 * linear-light color - a custom fragment must not call `pow(color, vec3(2.2))`
 * or any other transfer function on its result, and must return its own output
 * in the same domain (linear, premultiplied RGB, straight alpha) so blending
 * and any following filter stay consistent. A texture bound through
 * `options.textures` and sampled directly (bypassing `sampleBase`) is decoded
 * or not according to that `Texture`'s own resolved `colorSpace`, exactly as
 * for any other draw stage; a numeric texture (a mask, a lookup table) needs
 * `colorSpace: 'none'` on construction, not a shader-side workaround.
 * @advanced
 */
export class SpriteMaterial<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> extends Material<F, B> {
  public readonly target = 'sprite';

  public constructor(options: MaterialOptions<F, B>) {
    super(options);
  }

  /**
   * Build a `SpriteMaterial` from an existing {@link Shader}.
   * Equivalent to `new SpriteMaterial({ shader, ...options })`.
   */
  public static from<F extends UniformFields | undefined, B extends UniformBlockRecord | undefined>(
    source: Shader<F, B>,
    options?: Omit<MaterialOptions<F, B>, 'shader'>,
  ): SpriteMaterial<F, B>;
  /**
   * Build a `SpriteMaterial` from raw GLSL vertex and fragment source strings.
   * Wraps them in a new {@link Shader}; pass `options.wgsl` to also
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
    sourceOrGlslVertex: Shader<UniformFields | undefined, UniformBlockRecord | undefined> | string,
    optionsOrGlslFragment?: Omit<MaterialOptions, 'shader'> | string,
    glslOptions?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
    },
  ): SpriteMaterial<UniformFields | undefined, UniformBlockRecord | undefined> {
    if (sourceOrGlslVertex instanceof Shader) {
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

    const shader = new Shader({
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
