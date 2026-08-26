import { AnimatedSprite, Ease, type ObservableVector, Scene, Sprite, type Tween } from '@codexo/exojs';

class Level extends Scene {
  private sprite!: Sprite;
  private _activeTween: Tween<ObservableVector> | null = null;
  private _newTarget = 0;

  // #region guide:tween-init
  override init(): void {
    this.sprite = new Sprite(this.loader.get('image/hero.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(100, 300);

    this.app.tweens.create(this.sprite.position).to({ x: 700 }, 1.5).easing(Ease.cubicInOut).start();
  }
  // #endregion guide:tween-init

  private describeCallbacks(): void {
    // #region guide:tween-callbacks
    this.app.tweens
      .create(this.sprite)
      .to({ rotation: 360 }, 2)
      .onStart(() => console.log('started'))
      .onUpdate(t => console.log(`progress: ${t}`))
      .onComplete(() => console.log('finished'))
      .onRepeat(() => console.log('cycled'))
      .repeat(2)
      .start();
    // #endregion guide:tween-callbacks
  }

  private retarget(): void {
    // #region guide:tween-interrupt
    // Interrupt the current move and slide to a new position
    this._activeTween?.stop();
    this._activeTween = this.app.tweens.create(this.sprite.position).to({ x: this._newTarget }, 0.3).easing(Ease.cubicOut).start();
    // #endregion guide:tween-interrupt
  }
}

// #region guide:animated-sprite-scene
class AnimationScene extends Scene {
  private player!: AnimatedSprite;

  override init(): void {
    this.addChild(this.player);
    this.player.play('walk'); // advances automatically from here on
  }
}
// #endregion guide:animated-sprite-scene

export { AnimationScene, Level };
