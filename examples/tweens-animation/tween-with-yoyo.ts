import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite } from '@codexo/exojs';

class TweenWithYoyoScene extends Scene {
  private sprite!: Sprite;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
    app.tweens.create(this.sprite.scale).to({ x: 1.5, y: 1.5 }, 0.8).yoyo(true).repeat(-1).start();
    app.tweens.create(this.sprite).to({ rotation: 20 }, 0.8).yoyo(true).repeat(-1).start();
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { TweenWithYoyoScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

app.start(TweenWithYoyoScene);
