import type { Texture } from '@codexo/exojs';

import type { NormalSource } from './NormalSource';

/**
 * An authored tangent-space normal map.
 *
 * ```ts
 * hero.material = new LitMaterial({ lighting, normals: new NormalMap(heroNormals) });
 * ```
 *
 * Green above the midpoint means "faces up", which is what Blender, Substance,
 * Krita and every sprite-lighting tool write and what the engine reads - the
 * OpenGL convention. A map authored the other way up (the DirectX one) lights
 * its vertical detail from the wrong side while its horizontal detail stays
 * correct; invert the green channel of the texture to fix it.
 */
export class NormalMap implements NormalSource {
  public readonly texture: Texture;

  public constructor(texture: Texture) {
    this.texture = texture;
  }
}
