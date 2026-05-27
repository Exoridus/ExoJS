import type { MaterialOptions } from './Material';
import { Material } from './Material';

/**
 * Material specialization for {@link Mesh} drawables.
 *
 * Carries the mesh contract conceptually: fixed vertex attribute locations
 * (0 = position, 1 = texcoord, 2 = color), the auto-bound uniforms
 * `u_projection`/`u_translation`/`u_tint`/`u_texture`, and the WGSL
 * group(0)=mesh-uniforms / group(1)=texture / group(2)=user binding scheme.
 * Renderer wiring is added in a later phase.
 * @advanced
 */
export class MeshMaterial extends Material {
  public readonly target = 'mesh';

  public constructor(options: MaterialOptions) {
    super(options);
  }
}
