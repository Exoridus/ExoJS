import { Scene, type Seconds } from '@codexo/exojs';
import { PhysicsWorld } from '@codexo/exojs-physics';

class VariableStepScene extends Scene {
  private readonly world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

  // #region guide:variable-step
  public override update(delta: Seconds): void {
    // Also valid: world.step owns its own accumulator, so a raw variable delta
    // from requestAnimationFrame still yields deterministic, frame-rate
    // independent physics - you don't have to build your own accumulator.
    this.world.step(delta);
  }
  // #endregion guide:variable-step
}

export { VariableStepScene };
