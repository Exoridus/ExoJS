import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite, type Seconds } from '@codexo/exojs';

class GameLoopScene extends Scene {
  private sprite!: Sprite;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(width / 2, height / 2);
  }

  override update(delta: Seconds): void {
    this.sprite.rotate(delta * 120);
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { GameLoopScene },
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

app.start(GameLoopScene);
