import type { MaterialOptions } from '@codexo/exojs';
import { Material } from '@codexo/exojs';

/**
 * Material specialization for particle render modes.
 *
 * `Material`'s constructor is protected, so every material family declares a
 * thin subclass that fixes {@link target} and opens construction up — this is
 * the particle counterpart of core's `MeshMaterial` and `SpriteMaterial`.
 *
 * Particle draws bind their system-level state (transform, local bounds,
 * texture) through the renderer rather than through the material, so this
 * subclass adds no behaviour of its own; it exists to name the contract.
 */
export class ParticleMaterial extends Material {
  public readonly target = 'particle';

  public constructor(options: MaterialOptions) {
    super(options);
  }
}
