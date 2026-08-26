import { type ParticleBatch, UpdateModule } from '@codexo/exojs-particles';

// #region guide:sway-module
class Sway extends UpdateModule {
  override apply(particles: ParticleBatch, dt: number): void {
    const { x: velX } = particles.velocity;
    const { elapsed } = particles.timing;

    for (let i = 0; i < particles.count; i++) {
      velX[i] += Math.sin(elapsed[i] * 8) * 250 * dt;
    }
  }
}
// #endregion guide:sway-module

export { Sway };
