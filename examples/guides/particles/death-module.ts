import { DeathModule, type ParticleDeathContext, type ParticleSystem } from '@codexo/exojs-particles';

// #region guide:splash-on-death
class SplashOnDeath extends DeathModule {
  private readonly ripples: ParticleSystem;

  constructor(ripples: ParticleSystem) {
    super();
    this.ripples = ripples;
  }

  override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
    const ripple = this.ripples.emit();

    if (ripple) {
      ripple.position.set(death.x, death.y);
      ripple.velocity.set(death.velocityX * 0.25, death.velocityY * 0.25);
      ripple.lifetime = 0.6;
    }
  }
}
// #endregion guide:splash-on-death

export { SplashOnDeath };
