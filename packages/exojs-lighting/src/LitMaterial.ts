import { type BlendModes, type SamplerOptions, Shader, SpriteMaterial, UniformType } from '@codexo/exojs';

import type { ForwardBackend } from './backends/ForwardBackend';
import type { Lighting } from './Lighting';
import { flatNormalSource, normalGreenSign, type NormalSource } from './normals/NormalSource';
import glslFragment from './shaders/lit-sprite.frag';
import wgslSource from './shaders/lit-sprite.wgsl';

// Spelled out rather than inferred from the value: `LitMaterial` is public and
// carries this as a type argument, and the declaration emit keeps no trace of a
// module-local const - a `typeof` over one leaves the emitted `.d.ts` naming
// something it does not declare.
type LitUniforms = Readonly<{ emissive: UniformType.Float; normalY: UniformType.Float }>;

const litUniforms: LitUniforms = { emissive: UniformType.Float, normalY: UniformType.Float };

/**
 * The one shader pair behind every {@link LitMaterial}. Renderers key their
 * per-material GPU state on the shader instance, so sharing it keeps two
 * materials over the same textures in one pipeline.
 *
 * Exported so the repository's shader-compile gate can compose the uniform
 * block the authored fragment text reads but does not declare. Nothing else
 * should reach for it: a second material over this shader would share its
 * pipeline and its uniform layout without sharing its meaning.
 * @internal
 */
export const litSpriteShader = new Shader({ uniforms: litUniforms, glsl: { fragment: glslFragment }, wgsl: wgslSource });

/** Construction options for {@link LitMaterial}. */
export interface LitMaterialOptions {
  /** The system whose lights this material shades against. */
  readonly lighting: Lighting;
  /**
   * Where the surface normals come from. Omitted, the surface is flat and lit
   * as a plane - which is the point: a scene with no authored normal maps is
   * lit rather than black, and normals are an upgrade instead of an entry fee.
   */
  readonly normals?: NormalSource;
  /**
   * How much light the surface emits of its own, as a multiplier on its albedo.
   * `0` emits nothing, `1` makes the surface as bright as full white light
   * would, above `1` pushes it past what a light could - which is what a filter
   * in `post` keyed on a threshold is there to catch.
   *
   * It is added to the light term rather than to the colour, so a transparent
   * pixel stays transparent and emission scales the albedo the way a light
   * does: a black pixel emits nothing however high this is. Defaults to `0`.
   */
  readonly emissive?: number;
  /** Blend mode for sprites drawn with this material. */
  readonly blendMode?: BlendModes;
  /** Sampler for the base texture. */
  readonly sampler?: SamplerOptions | null;
}

/**
 * Makes a sprite respond to the lights of a {@link Lighting} system.
 *
 * ```ts
 * crate.material = new LitMaterial({ lighting });
 * hero.material = new LitMaterial({ lighting, normals: new NormalMap(heroNormalMap) });
 * ```
 *
 * The shaded result is `albedo * (ambient + sum over lights)`, each light
 * falling off quadratically to nothing at its radius and, for a cone light,
 * fading across its edge.
 *
 * # One normal source per material
 *
 * Normals are a material binding, not a per-sprite one, so every sprite drawn
 * with a given material shares them - in practice one material per atlas.
 * Sprites from a second atlas need a second material, which breaks the batch at
 * the material boundary. Both shade against the same system.
 *
 * # Ownership
 *
 * The material owns neither the lighting system nor the textures. `destroy()`
 * releases only the GPU resources cached against this material.
 */
export class LitMaterial extends SpriteMaterial<LitUniforms> {
  /** The system this material shades against. */
  public readonly lighting: Lighting;

  private _normals: NormalSource;

  public constructor(options: LitMaterialOptions) {
    const backend = options.lighting.backend;

    // Both renderers expose a `lightTexture`, and they are nothing alike: this
    // shader reads the forward renderer's packed rgba32f light data, while the
    // lightmap renderer's is an accumulated light field. Binding one for the
    // other compiles and shades garbage, so the mismatch is refused here - the
    // same call that would otherwise have to be debugged from a picture.
    if (backend.quality !== 'forward') {
      throw new Error(
        `LitMaterial shades inside the sprite fragment stage, against the 'forward' renderer's light texture, but this Lighting uses '${backend.quality}'. ` +
          "The 'lightmap' renderer multiplies the finished frame by a light field and has no surface normals to shade against: use quality: 'forward' for " +
          'normal-mapped sprites, or drop the material and let the renderer light the frame.',
      );
    }

    super({
      shader: litSpriteShader,
      // Declaration order is the group(2) binding order on WebGPU: normal map at
      // bindings 1/2, light texture at 3/4, matching `lit-sprite.wgsl`.
      textures: {
        u_normalMap: (options.normals ?? flatNormalSource()).texture,
        u_lights: (backend as ForwardBackend).lightTexture,
      },
      ...(options.blendMode !== undefined ? { blendMode: options.blendMode } : {}),
      ...(options.sampler !== undefined ? { sampler: options.sampler } : {}),
    });

    this.lighting = options.lighting;
    this._normals = options.normals ?? flatNormalSource();
    this.emissive = options.emissive ?? 0;
    this.uniforms.normalY.set(normalGreenSign(this._normals));
  }

  /** How much light the surface emits of its own. See {@link LitMaterialOptions.emissive}. */
  public get emissive(): number {
    return this.uniforms.emissive.value;
  }

  public set emissive(emissive: number) {
    this.uniforms.emissive.set(emissive);
  }

  /**
   * The bound normal source. Assigning a replacement takes effect on the next
   * draw and carries its own channel convention with it.
   */
  public get normals(): NormalSource {
    return this._normals;
  }

  public set normals(normals: NormalSource) {
    this._normals = normals;
    this.setTexture('u_normalMap', normals.texture);
    this.uniforms.normalY.set(normalGreenSign(normals));
  }
}
