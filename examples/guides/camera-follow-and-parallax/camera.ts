import { Container, type RenderingContext, Scene, type Seconds, Sprite, View } from '@codexo/exojs';

class CameraScene extends Scene {
  private _view!: View;
  private player!: Sprite;
  private worldLayer = new Container();

  // #region guide:camera-follow
  override init(): void {
    this._view = new View(400, 300, 800, 600);
    this.player = new Sprite(this.loader.get('image/hero.png'));
  }

  override update(delta: Seconds): void {
    // ... move player based on input ...

    // Camera follows player
    this._view.setCenter(this.player.position.x, this.player.position.y);
  }

  override draw(context: RenderingContext): void {
    context.render(this.worldLayer, { view: this._view });
  }
  // #endregion guide:camera-follow
}

class SmoothCameraScene extends Scene {
  private _view = new View(400, 300, 800, 600);
  private player = new Sprite();
  private _cameraX = 0;
  private _cameraY = 0;

  // #region guide:camera-smoothing
  override update(delta: Seconds): void {
    this._cameraX += (this.player.x - this._cameraX) * 5 * delta;
    this._cameraY += (this.player.y - this._cameraY) * 5 * delta;
    this._view.setCenter(this._cameraX, this._cameraY);
  }
  // #endregion guide:camera-smoothing
}

export { CameraScene, SmoothCameraScene };
