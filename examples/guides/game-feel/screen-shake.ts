import { Scene, Time, Vector, View } from '@codexo/exojs';
import { BurstSpawn, Constant, ParticleSystem } from '@codexo/exojs-particles';

class ShakeScene extends Scene {
  private view = new View(0, 0, 800, 600);
  private burstPos = new Vector(0, 0);
  private particles!: ParticleSystem;
  private burst = new BurstSpawn({ schedule: [{ time: 0, count: 160 }], position: new Constant(this.burstPos) });

  private bindTap(): void {
    // #region guide:screen-shake
    this.app.input.onPointerTap.add(pointer => {
      // Position the burst at the click location (relative to system position)
      this.burstPos.set(pointer.x - this.particles.position.x, pointer.y - this.particles.position.y);
      this.burst.reset();
      // Shake the view: 22px intensity, 0.28s, 26Hz oscillation, with decay
      this.view.shake(22, Time.seconds(0.28), { frequency: 26, decay: true });
    });
    // #endregion guide:screen-shake
  }
}

export { ShakeScene };
