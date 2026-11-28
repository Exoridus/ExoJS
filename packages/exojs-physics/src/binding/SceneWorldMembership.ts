import type { Scene, SystemContext } from '@codexo/exojs';

import type { PhysicsBodyComponent } from '../PhysicsBodyComponent';
import type { PhysicsWorld } from '../PhysicsWorld';

/** Automatically resolved components belong to one registration of a world. @internal */
export class SceneWorldMembership {
  public readonly components = new Set<PhysicsBodyComponent>();

  public constructor(
    private readonly _context: SystemContext,
    private readonly _world: PhysicsWorld,
  ) {}

  public belongsTo(scene: Scene): boolean {
    return !this._world.destroyed && this._context.scene === scene && this._context.systems.has(this._world);
  }

  public detach(): void {
    let failed = false;
    let failure: unknown;

    for (const component of this.components) {
      try {
        component.enabled = false;
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }

    this.components.clear();

    if (failed) {
      throw failure;
    }
  }

  public removeWorld(): void {
    this.components.clear();
    this._context.systems.remove(this._world);
  }
}
