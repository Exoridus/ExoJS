import { type RenderingContext, Scene, type Seconds } from '@codexo/exojs';
import { ParticleSystem } from '@codexo/exojs-particles';

// #region guide:particle-scene
class ParticleScene extends Scene {
  private system!: ParticleSystem;

  override update(delta: Seconds): void {
    this.system.update(delta);
  }

  override draw(context: RenderingContext): void {
    context.render(this.system);
  }
}
// #endregion guide:particle-scene

export { ParticleScene };
