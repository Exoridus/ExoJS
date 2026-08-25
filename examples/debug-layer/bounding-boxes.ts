import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite, type Seconds } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';

class BoundingBoxesScene extends Scene {
  private sprites!: { sprite: Sprite; speed: number }[];
  private time = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;
    const count = 7;
    const margin = width * 0.12;
    const step = (width - 2 * margin) / (count - 1);

    this.sprites = Array.from({ length: count }, (_, i) => {
      const sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(0.8);
      sprite.setPosition(margin + i * step, height / 2 + Math.sin(i) * 80);
      // The boundingBoxes layer walks the SCENE GRAPH (scene.root), so
      // the sprites must be attached to it - nodes that are only passed
      // to context.render() directly are invisible to the overlay.
      this.root.addChild(sprite);
      return { sprite, speed: 0.8 + i * 0.14 };
    });
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { height } = app;

    this.time += delta;
    for (const { sprite, speed } of this.sprites) {
      sprite.setRotation(this.time * 35 * speed);
      sprite.setPosition(sprite.position.x, height / 2 + Math.sin(this.time * speed) * 100);
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { BoundingBoxesScene },
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

const debug = new DebugOverlay(app);
debug.layers.boundingBoxes.visible = true;

app.start(BoundingBoxesScene);
