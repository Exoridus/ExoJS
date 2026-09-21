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
 */
export class NormalMap implements NormalSource {
  public readonly texture: Texture;
  public readonly convention: NormalConvention;

  public constructor(texture: Texture, options: NormalMapOptions = {}) {
    this.texture = texture;
    this.convention = options.convention ?? 'opengl';
  }
}
