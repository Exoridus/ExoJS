import type { Texture } from '@codexo/exojs';

import type { NormalConvention, NormalSource } from './NormalSource';

/** Construction options for {@link NormalMap}. */
export interface NormalMapOptions {
  /**
   * Which way up the map's green channel is authored. Defaults to `opengl`.
   * See {@link NormalConvention}.
   */
  readonly convention?: NormalConvention;
}

/**
 * An authored tangent-space normal map.
 *
 * ```ts
 * hero.material = new LitMaterial({ lighting, normals: new NormalMap(heroNormals) });
 * hero.material = new LitMaterial({ lighting, normals: new NormalMap(heroNormals, { convention: 'directx' }) });
 * ```
 *
 * The default input convention is OpenGL: green above the midpoint means the
 * normal leans towards the top of the image, and a flat texel is
 * `(128, 128, 255)`. A map authored the other way up lights its vertical
 * detail from the wrong side while its horizontal detail stays correct;
 * declare it as `directx` rather than editing the texture.
 *
 * `texture` is sampled as numeric data, so it must not resolve to sRGB colour:
 * its XYZ channels would be hardware-decoded on sample. Build it as a
 * `DataTexture`, or as an image `Texture` declared `colorSpace: 'none'`, or the
 * constructor throws.
 */
export class NormalMap implements NormalSource {
  public readonly texture: Texture;
  public readonly convention: NormalConvention;

  public constructor(texture: Texture, options: NormalMapOptions = {}) {
    if (texture.colorSpace === 'srgb') {
      throw new Error(
        'NormalMap: the texture resolved to colorSpace "srgb", but a normal map\'s XYZ channels are numeric data, not colour - ' +
          'sampling it through an sRGB view would decode the normal itself. Construct the Texture with "none" (or a DataTexture).',
      );
    }

    this.texture = texture;
    this.convention = options.convention ?? 'opengl';
  }
}
