import { DataTexture, type Texture, TextureFormat } from '@codexo/exojs';

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

/** Normal sources. */
export const Normals = {
  /** An authored tangent-space normal map. */
  map: (texture: Texture): NormalSource => ({ texture }),
} as const;
