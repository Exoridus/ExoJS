import { DataTexture, type Texture, TextureFormat } from '@codexo/exojs';

/**
 * Which way up a tangent-space normal map's green channel is authored.
 *
 * `opengl` is the canonical input convention of this package: green above the
 * midpoint means the normal leans towards the TOP of the image, blue means out
 * of the sprite plane towards the light, and a flat texel is `(128, 128, 255)`.
 * Blender, Substance, Krita, Godot and Unity's default sprite import all write
 * that. `directx` is the same map with its green channel mirrored, which is
 * what 3ds Max and some Unreal pipelines write.
 *
 * It describes the CHANNELS, not the image: a map in the other convention is
 * not an upside-down picture, and flipping the texture vertically is not a
 * substitute for declaring this.
 */
export type NormalConvention = 'opengl' | 'directx';

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
  /**
   * Which way up the map's green channel is authored. Defaults to `opengl`
   * where a source leaves it out, which is what every generator in this
   * package writes.
   */
  readonly convention?: NormalConvention;
}

/**
 * The factor a tangent normal's `y` is scaled by to bring a source into the
 * canonical convention, ready to hand to a shader.
 * @internal
 */
export const normalGreenSign = (source: NormalSource | undefined): number => (source?.convention === 'directx' ? -1 : 1);

/**
 * The shared 1x1 flat normal, pointing straight out of the plane.
 *
 * One texture for every material without normals: they all sample the same
 * texel, so binding it costs a slot rather than a branch in the shader, and the
 * unlit-looking special case never exists.
 * @internal
 */
let flat: DataTexture<TextureFormat.Rgba8> | null = null;

/** @internal - a source over the shared flat normal, for a material given none. */
export const flatNormalSource = (): NormalSource => ({ texture: flatNormals(), convention: 'opengl' });

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
