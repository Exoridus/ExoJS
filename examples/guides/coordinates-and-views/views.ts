import { Container, Keyboard, type RenderingContext, Scene, Sprite } from '@codexo/exojs';

class CameraScene extends Scene {
  private world = new Container();
  private player = new Sprite();

  // #region guide:fixed-view
  override draw(context: RenderingContext): void {
    context.view.setCenter(400, 300);
    context.view.resize(800, 600);

    context.render(this.world);
  }
  // #endregion guide:fixed-view

  private drawFollowing(context: RenderingContext): void {
    // #region guide:follow-view
    context.view.follow(this.player);

    context.render(this.world);
    // #endregion guide:follow-view
  }
}

class ZoomScene extends Scene {
  private world = new Container();
  private zoom = 1;

  // #region guide:zoom-view
  override init(): void {
    this.zoom = 1;

    this.inputs.onTrigger(Keyboard.Equal, () => {
      // the key printed =/+ on US QWERTY
      this.zoom += 0.1;
    });
  }

  override draw(context: RenderingContext): void {
    context.view.setZoom(this.zoom);

    context.render(this.world);
  }
  // #endregion guide:zoom-view
}

class SplitScreenScene extends Scene {
  private world = new Container();
  private player1 = new Sprite();
  private player2 = new Sprite();

  // #region guide:split-viewport
  override draw(context: RenderingContext): void {
    context.view.setViewport(0, 0, 0.5, 1);
    context.view.setCenter(this.player1.x, this.player1.y);
    context.render(this.world);

    context.view.setViewport(0.5, 0, 0.5, 1);
    context.view.setCenter(this.player2.x, this.player2.y);
    context.render(this.world);
  }
  // #endregion guide:split-viewport
}

export { CameraScene, SplitScreenScene, ZoomScene };
