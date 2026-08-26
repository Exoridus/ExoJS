import { Scene, SceneNode, type Seconds, type Sound, type Voice } from '@codexo/exojs';

class TurretScene extends Scene {
  private voice!: Voice;
  private turret = new SceneNode();

  // #region guide:follow-orientation
  update(delta: Seconds) {
    this.voice.follow(this.turret); // position tracks automatically...
    this.voice.orientation = this.turret.rotation; // ...orientation does not
  }
  // #endregion guide:follow-orientation
}

class PickupScene extends Scene {
  private pickupSfx!: Sound;
  private player = new SceneNode();
  private item = new SceneNode();
  private pickupCollected = false;

  // #region guide:listener-and-pickup
  init() {
    this.pickupSfx = this.loader.get('audio/pickup.wav');
    this.pickupSfx.volume = 0.6;

    this.app.audio.listener.target = this.player;
  }

  update(delta: Seconds) {
    // ... game logic ...

    if (this.pickupCollected) {
      this.app.audio.play(this.pickupSfx, { position: { x: this.item.x, y: this.item.y } });
    }
  }
  // #endregion guide:listener-and-pickup
}

export { PickupScene, TurretScene };
