import {
  Application,
  BitmapText,
  type BmFont,
  Color,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  ScaleModes,
  Scene,
  type Seconds,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, startExample } from '@examples/runtime';

const controls = { scale: choice('Scale', ['1x', '2x', '3x', '2.5x']) };

class BitmapTextBasicScene extends Scene {
  private font!: BmFont;
  private bitmap!: BitmapText;
  private counter!: BitmapText;
  private readonly raster = this.track(new Text('PLAY', { fontFamily: 'monospace', fillColor: new Color(236, 239, 242) }));
  private readonly labels = ['BitmapText / atlas glyphs', 'Text / browser raster'].map(text =>
    this.track(new Text(text, { fillColor: new Color(168, 175, 181) })),
  );
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private elapsed = 0;
  private playing = true;
  private count = -1;

  override async load(): Promise<void> {
    this.font = await this.loader.load(assets.fontKenneyBlocksFnt);
    this.font.textures.forEach(texture => {
      texture.scaleMode = ScaleModes.Nearest;
    });
    this.bitmap = this.track(new BitmapText('PLAY', this.font));
    this.counter = this.track(new BitmapText('COUNT 0000', this.font));
    this.counter.tint = new Color(136, 233, 126);
  }

  override init(): void {
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
      },
    });
  }

  override update(delta: Seconds): void {
    if (this.playing) {
      this.elapsed += delta;
    }

    const { scale: k, width, contentHeight, compact } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const multiplier = Number.parseFloat(this.panel.values.scale);
    const fontSize = this.font.fontData.lineHeight;
    const top = Math.max(28, (contentHeight - fontSize * multiplier - 54) / 2);
    const count = Math.floor(this.elapsed * 10);

    this.bitmap.setPosition(24 * k, top * k).setScale(multiplier * k);
    this.raster.style.fontSize = fontSize;
    this.raster.setPosition((width / 2 + 12) * k, top * k).setScale(multiplier * k);
    this.labels.forEach((label, index) => {
      label.style.fontSize = 14 * k;
      label.setPosition((index ? width / 2 + 12 : 24) * k, 10 * k);
    });
    this.counter.setPosition(24 * k, (top + fontSize * multiplier + 14) * k).setScale(k);

    if (count !== this.count) {
      this.counter.text = `COUNT ${String(count).padStart(4, '0')}`;
      this.count = count;
    }

    this.panel.status(
      `${this.playing ? 'Counting' : 'Paused'} | ${this.panel.values.scale} | ${compact ? 'Atlas loaded' : 'kenney-blocks-32.fnt loaded | Nearest sampling'}`,
      'success',
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.bitmap);
    context.render(this.raster);
    context.render(this.counter);
    this.labels.forEach(label => context.render(label));
  }

  override destroy(): void {
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { BitmapTextBasicScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 24, 29),
});

await startExample(app, () => app.start(BitmapTextBasicScene));
