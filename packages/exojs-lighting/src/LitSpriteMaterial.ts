import type { BlendModes, SamplerOptions, Texture } from '@codexo/exojs';
import { ShaderSource, SpriteMaterial } from '@codexo/exojs';

import type { LightingSystem } from './LightingSystem';
import fragmentGlsl from './shaders/lit-sprite.frag';
import vertexGlsl from './shaders/lit-sprite.vert';
import fragmentWgsl from './shaders/lit-sprite.wgsl';

/**
 * The one shader pair behind every `LitSpriteMaterial`. Renderers key their
 * compiled program and pipeline caches on `ShaderSource` identity, so N lit
 * materials cost one compile per backend rather than N.
 */
const litSpriteShader = new ShaderSource({
  glsl: { vertex: vertexGlsl, fragment: fragmentGlsl },
  wgsl: fragmentWgsl,
});

/** Construction options for {@link LitSpriteMaterial}. */
export interface LitSpriteMaterialOptions {
  /** System whose light texture this material shades against. Not owned. */
  readonly lighting: LightingSystem;
  /**
   * Tangent-space normal map, sampled with the sprite's own UVs: it must be
   * laid out exactly like the base atlas, frame for frame. `+x` points right
   * and `+y` points down the texture, matching the sprite's local axes.
   */
  readonly normalMap: Texture;
  /** Compositing blend mode. Defaults to `BlendModes.Normal`. */
  readonly blendMode?: BlendModes;
  /** Filter/wrap override for the base texture, or `null` to inherit it. Defaults to `null`. */
  readonly sampler?: SamplerOptions | null;
}

/**
 * A {@link SpriteMaterial} that shades sprites with a tangent-space normal map
 * against the point lights of a {@link LightingSystem}.
 *
 * Lighting happens in the sprite's own fragment stage, so a lit sprite costs no
 * extra pass and no extra draw call: every sprite sharing this material and a
 * base-texture slot stays in one batch. The shaded result is
 * `albedo * (ambient + sum over lights)`, with each light falling off
 * quadratically to nothing at its radius.
 *
 * # One normal map per material
 *
 * The normal map is a material binding, not a per-sprite one, so all sprites
 * drawn with a given `LitSpriteMaterial` must share its layout - in practice
 * one material per atlas. Sprites from a second atlas need a second material,
 * which breaks the batch at the material boundary. Both materials can shade
 * against the same `LightingSystem`.
 *
 * # Ownership
 *
 * The material owns neither the lighting system nor the textures.
 * {@link SpriteMaterial.destroy} releases only the GPU resources cached against
 * this material.
 *
 * ```ts
 * const lighting = new LightingSystem();
 * const material = new LitSpriteMaterial({ lighting, normalMap });
 *
 * scene.systems.add(lighting);
 * lighting.add(new PointLight({ x: 400, y: 300, radius: 320 }));
 * sprite.material = material;
 * ```
 */
export class LitSpriteMaterial extends SpriteMaterial {
  /** The system this material shades against. */
  public readonly lighting: LightingSystem;

  public constructor(options: LitSpriteMaterialOptions) {
    super({
      shader: litSpriteShader,
      // Declaration order is the group(2) binding order on WebGPU: normal map at
      // bindings 1/2, light texture at 3/4, matching `lit-sprite.wgsl`.
      textures: { u_normalMap: options.normalMap, u_lights: options.lighting.lightTexture },
      ...(options.blendMode !== undefined ? { blendMode: options.blendMode } : {}),
      ...(options.sampler !== undefined ? { sampler: options.sampler } : {}),
    });

    this.lighting = options.lighting;
  }

  /** The bound normal map. Assigning a replacement takes effect on the next draw. */
  public get normalMap(): Texture {
    return this.textures.u_normalMap as Texture;
  }

  public set normalMap(texture: Texture) {
    this.setTexture('u_normalMap', texture);
  }
}
