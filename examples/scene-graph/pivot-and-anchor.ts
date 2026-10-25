import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Rectangle,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  Text,
  type Texture,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';

const VARIANTS = [
  { label: 'Anchor (0, 0)', anchor: [0, 0], origin: null },
  { label: 'Anchor (0.5, 0.5)', anchor: [0.5, 0.5], origin: null },
  { label: 'Origin (78, -8)', anchor: [0.5, 0.5], origin: [78, -8] },
] as const;
class PivotAndAnchorScene extends Scene {
  private texture!: Texture;
  private sprites: Sprite[] = [];
  private labels: Text[] = [];
  private readonly overlay = new Graphics();
  private panel!: ReturnType<typeof demoPanel<Record<string, never>>>;
  private playing = true;
  private angle = 0;

  override async load(): Promise<void> {
    this.texture = await this.loader.load(assets.platformerTilesImage);
  }

  override init(): void {
    VARIANTS.forEach(variant => {
      const sprite = new Sprite(this.texture).setTextureFrame(new Rectangle(650, 325, 64, 64));
      sprite.setAnchor(variant.anchor[0], variant.anchor[1]);

      if (variant.origin) {
        sprite.setOrigin(...variant.origin);
      }

      this.sprites.push(sprite);
      this.labels.push(new Text(variant.label, { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5));
    });
    this.root.addChild(...this.sprites, this.overlay, ...this.labels);
    this.panel = demoPanel({
      scene: this,
      title: 'Pivot and Anchor',
      layout: 'bar',
      controls: {},
      hint: 'Red cross: position / pivot. Cyan: world bounds. Same texture and angle.',
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        'Step 15°': () => this.step(),
        Reset: () => {
          this.angle = 0;
        },
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
    this.inputs.onTrigger(Keyboard.Right, () => this.step());
    this.inputs.onTrigger(Keyboard.R, () => {
      this.angle = 0;
    });
  }

  private step(): void {
    this.playing = false;
    this.angle += 15;
  }

  override update(delta: Seconds): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(scale);

    if (this.playing) {
      this.angle += delta * 35;
    }

    this.overlay.clear();
    this.overlay.fillColor = Color.transparent;
    this.overlay.lineWidth = 2;

    for (const [index, sprite] of this.sprites.entries()) {
      const x = (width * (index + 0.5)) / 3;
      const y = contentHeight * 0.55;
      sprite
        .setPosition(x, y)
        .setRotation(this.angle)
        .setScale(width < 720 ? 0.8 : 2);
      const bounds = sprite.getBounds();
      this.overlay.lineColor = new Color(110, 215, 245);
      this.overlay.drawRectangle(bounds.x / scale, bounds.y / scale, bounds.width / scale, bounds.height / scale);
      this.overlay.lineColor = new Color(255, 100, 100);
      this.overlay.moveTo(x - 7, y);
      this.overlay.lineTo(x + 7, y);
      this.overlay.moveTo(x, y - 7);
      this.overlay.lineTo(x, y + 7);
      this.labels[index].setPosition(x, 18);
    }

    this.panel.status(
      `${this.playing ? 'Running' : 'Paused'} | angle ${(((this.angle % 360) + 360) % 360).toFixed(0)}° | bounds are derived`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  override destroy(): void {
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PivotAndAnchorScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
});
await startExample(app, () => app.start(PivotAndAnchorScene));
