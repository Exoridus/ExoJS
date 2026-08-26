import { Scene, type Seconds, Sprite, type Voice } from '@codexo/exojs';
import { Constant, ParticleSystem } from '@codexo/exojs-particles';

class ThrustScene extends Scene {
  private thrust = { x: 0, y: 0 };
  private angle = 0;
  private ship = new Sprite();
  private particles!: ParticleSystem;
  private rate = new Constant(0);
  private engine!: Voice;

  // #region guide:thrust-feedback
  override update(delta: Seconds): void {
    const thrustMag = Math.hypot(this.thrust.x, this.thrust.y);

    if (thrustMag > 0.05) {
      // Particles trail behind the ship
      this.rate.value = 900 * thrustMag;
      this.particles.setPosition(this.ship.x - Math.cos(this.angle) * 28, this.ship.y - Math.sin(this.angle) * 28);

      // Audio hum scales with thrust
      this.engine.volume = 0.08 + thrustMag * 0.32;
    } else {
      this.rate.value = 0;
      this.engine.volume = 0;
    }

    this.particles.update(delta);
  }
  // #endregion guide:thrust-feedback
}

export { ThrustScene };
