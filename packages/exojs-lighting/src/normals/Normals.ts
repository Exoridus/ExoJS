import { DataTexture, type Texture, TextureFormat } from '@codexo/exojs';

import { deriveNormalsFromAlpha, type DeriveNormalsOptions } from './deriveNormals';

/**
 * Where a {@link LitMaterial} takes its surface normals from.
 *
 * An object rather than a name, so a source carries its own parameters and a
 * user can add one: anything that produces a tangent-space normal texture -
 * derived from a height map, from two photographs, from a generator - is a
 * valid source without this package knowing about it.
 */
export interface NormalSource {
  /** The tangent-space normal map to bind. */
  readonly texture: Texture;
}

/**
 * The shared 1x1 flat normal, pointing straight out of the plane.
 *
 * One texture for every material without normals: they all sample the same
 * texel, so binding it costs a slot rather than a branch in the shader, and the
 * unlit-looking special case never exists.
 * @internal
 */
let flat: DataTexture<TextureFormat.Rgba8> | null = null;

/** @internal - the shared flat normal, created on first use. */
export const flatNormals = (): Texture => {
  if (flat === null) {
    flat = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8 });
    // Tangent space (0, 0, 1) encoded as a colour: the surface faces the viewer.
    flat.buffer[0] = 128;
    flat.buffer[1] = 128;
    flat.buffer[2] = 255;
    flat.buffer[3] = 255;
    flat.commit();
  }

  return flat;
};

/** Where a material takes its surface normals from. */
export const Normals = {
  /** An authored tangent-space normal map. */
  map: (texture: Texture): NormalSource => ({ texture }),
  /**
   * Normals derived from a texture's own alpha channel, computed once.
   *
   * The silhouette read as a height field, which gives edges that turn away
   * from the light without anyone authoring a map. It knows nothing about the
   * interior of a shape, so it is a floor rather than a replacement - but it is
   * the difference between art that reacts to light and art that does not.
   *
   * The source must be drawable when this is called: a texture that is still
   * loading yields a flat map rather than waiting.
   */
  fromAlpha: (texture: Texture, options?: DeriveNormalsOptions): NormalSource => ({ texture: deriveNormalsFromAlpha(texture, options) }),
} as const;
