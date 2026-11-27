import { type RenderingContext, Scene, type Seconds, Sprite, View } from '@codexo/exojs';

class CameraScene extends Scene {
  private _view!: View;
  private player!: Sprite;
  private worldLayer = this.root;

  // #region guide:camera-follow
  override init(): void {
    this._view = this.track(new View(400, 300, 800, 600));
    this.player = new Sprite('image/hero.png');
    this.worldLayer.addChild(this.player);
  }

  override update(delta: Seconds): void {
    // ... move player based on input ...

    // Camera follows player
    const target = this.player.getWorldTransform();

    this._view.setCenter(target.x, target.y);
  }

  override draw(context: RenderingContext): void {
    context.render(this.worldLayer, { view: this._view });
  }
  // #endregion guide:camera-follow
}

class SmoothCameraScene extends Scene {
  private _view = this.track(new View(400, 300, 800, 600));
  private player = new Sprite();
  private _cameraX = 400;
  private _cameraY = 300;

  // #region guide:camera-smoothing
  override update(delta: Seconds): void {
    const target = this.player.getWorldTransform();
    const weight = 1 - Math.exp(-5 * delta);

    this._cameraX += (target.x - this._cameraX) * weight;
    this._cameraY += (target.y - this._cameraY) * weight;
    this._view.setCenter(this._cameraX, this._cameraY);
  }
  // #endregion guide:camera-smoothing
}

export { CameraScene, SmoothCameraScene };
