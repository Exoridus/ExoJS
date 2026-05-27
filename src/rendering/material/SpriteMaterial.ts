import type { MaterialOptions } from './Material';
import { Material } from './Material';

/**
 * Material specialization for {@link Sprite} drawables.
 *
 * API shell for the sprite custom-material path; the renderer integration
 * and instancing contract are added in a later phase. The base texture
 * stays on the sprite — this material supplies the fragment program,
 * uniforms, and additional texture bindings.
 * @advanced
 */
export class SpriteMaterial extends Material {
  public readonly target = 'sprite';

  public constructor(options: MaterialOptions) {
    super(options);
  }
}
