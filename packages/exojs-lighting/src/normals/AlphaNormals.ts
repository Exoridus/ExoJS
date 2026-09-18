import type { Texture } from '@codexo/exojs';

import { deriveNormalsFromAlpha, type DeriveNormalsOptions } from './deriveNormals';
import type { NormalSource } from './NormalSource';

/**
 * Normals derived from a texture's own alpha channel, computed once.
 *
 * ```ts
 * crate.material = new LitMaterial({ lighting, normals: new AlphaNormals(crateTexture) });
 * ```
 *
 * The silhouette read as a height field, which gives edges that turn away from
 * the light without anyone authoring a map. It knows nothing about the interior
 * of a shape, so it is a floor rather than a replacement - but it is the
 * difference between art that reacts to light and art that does not.
 *
 * The source must be drawable at construction: a texture that is still loading
 * yields a flat map rather than waiting.
 */
export class AlphaNormals implements NormalSource {
  public readonly texture: Texture;

  public constructor(texture: Texture, options?: DeriveNormalsOptions) {
    this.texture = deriveNormalsFromAlpha(texture, options);
  }
}
