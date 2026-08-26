import { Color, Ease, Scene, Signal, Sprite } from '@codexo/exojs';

class DamageScene extends Scene {
  private player!: Sprite;
  private flashColor!: Color;
  private onDamage!: Signal;

  // #region guide:damage-flash
  override init(): void {
    this.player = new Sprite(this.loader.get('image/hero.png'));
    this.flashColor = Color.white.clone();

    this.onDamage = new Signal();
    this.onDamage.add(() => {
      // Flash red instantly
      this.flashColor.set(255, 80, 80, 1);
      // Tween back to white over 200ms
      this.app.tweens.create(this.flashColor).to({ r: 255, g: 255, b: 255 }, 0.2).start();
    });
  }

  override update(): void {
    // The tween moves the Color; handing it to setTint is what tells the
    // renderer about it - mutating a live Color in place notifies nobody.
    this.player.setTint(this.flashColor);
  }
  // #endregion guide:damage-flash
}

class PunchScene extends Scene {
  private sprite = new Sprite();
  private overlay = new Sprite();

  private punch(): void {
    // #region guide:tween-punch
    // Scale punch - grow on hit, settle back
    this.app.tweens.create(this.sprite.scale).to({ x: 1.4, y: 1.4 }, 0.08).yoyo().repeat(1).easing(Ease.cubicOut).start();

    // Tilt wobble - oscillate rotation
    this.app.tweens.create(this.sprite).to({ rotation: 8 }, 0.06).easing(Ease.cubicOut).yoyo().repeat(2).start();

    // Fade flash - full white overlay that fades out
    this.overlay.tint.a = 1;
    this.app.tweens.create(this.overlay.tint).to({ a: 0 }, 0.3).start();
    // #endregion guide:tween-punch
  }
}

export { DamageScene, PunchScene };
