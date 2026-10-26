import { Application, Color, FixedResolutionCanvasSizing, Graphics, Rectangle, type RenderingContext, Scene, Sprite } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, startExample } from '@examples/runtime';

const controls = { shape: choice('Shape', ['Rectangle', 'Circle', 'Ellipse', 'Polygon']) };

class MasksScene extends Scene {
  private sprite!: Sprite;
  private readonly rectMask = new Rectangle();
  private readonly shapeMask = this.track(new Graphics());
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;

  override async load(): Promise<void> {
    this.sprite = new Sprite(await this.loader.load(assets.backgroundPlatformerHills)).setAnchor(0.5);
  }

  override init(): void {
    this.sprite.interactive = true;
    this.sprite.onPointerTap.add(() => this.panel.step('shape'));
    this.root.addChild(this.sprite);
    this.panel = demoPanel({ scene: this, layout: 'bar', controls });
  }

  override update(): void {
    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const x = (width / 2) * k;
    const y = (contentHeight / 2) * k;
    const radius = Math.min(width * 0.32, contentHeight * 0.4, 200) * k;

    this.sprite.setPosition(x, y);
    this.sprite.width = radius * 2.8;
    this.sprite.height = radius * 2.1;
    this.shapeMask.clear();
    this.shapeMask.fillColor = Color.white;

    switch (this.panel.values.shape) {
      case 'Rectangle':
        this.rectMask.set(x - radius, y - radius * 0.72, radius * 2, radius * 1.44);
        this.sprite.mask = this.rectMask;
        break;
      case 'Circle':
        this.shapeMask.drawCircle(x, y, radius);
        this.sprite.mask = this.shapeMask;
        break;
      case 'Ellipse':
        this.shapeMask.drawEllipse(x, y, radius * 1.15, radius * 0.7);
        this.sprite.mask = this.shapeMask;
        break;
      case 'Polygon':
        this.shapeMask.drawPolygon([
          x - radius,
          y,
          x - radius * 0.5,
          y - radius * 0.85,
          x + radius * 0.5,
          y - radius * 0.85,
          x + radius,
          y,
          x + radius * 0.5,
          y + radius * 0.85,
          x - radius * 0.5,
          y + radius * 0.85,
        ]);
        this.sprite.mask = this.shapeMask;
        break;
    }

    this.panel.status('Click the image to change its mask');
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  override destroy(): void {
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { MasksScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
});
await startExample(app, () => app.start(MasksScene));
