import {
  Application,
  BloomFilter,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  Text,
} from '@codexo/exojs';
import { demoPanel, slider, toggle } from '@examples/runtime';

// Threshold uses linear luminance: encoded gray 128 is approximately 0.22, not 0.5.
const LEVELS = [40, 90, 140, 190, 225, 255];
const controls = {
  threshold: slider('Threshold', { min: 0, max: 1, step: 0.05, value: 0.6 }),
  intensity: slider('Intensity', { min: 0, max: 4, step: 0.1, value: 1.6 }),
  spread: slider('Spread', { min: 0, max: 24, step: 1, value: 10 }),
  bypass: toggle('Bypass'),
};
class BloomFilterScene extends Scene {
  private readonly bloom = this.track(new BloomFilter({ threshold: 0.6, intensity: 1.6, strength: 10, levels: 3 }));
  private readonly stage = new Container();
  private readonly discs = new Graphics();
  private readonly beam = new Graphics();
  private labels: Text[] = [];
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private elapsed = 0;
  private playing = true;

  override init(): void {
    this.stage.addChild(this.discs, this.beam);
    this.root.addChild(this.stage);
    this.labels = LEVELS.map(value => {
      const channel = value / 255;
      const luminance = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

      return new Text(luminance.toFixed(2), { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5);
    });
    this.root.addChild(...this.labels);
    this.panel = demoPanel({
      title: 'Bloom Threshold',
      layout: 'bar',
      controls,
      hint: 'Six increasing linear luminances; white sweep is the same moving input.',
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
  }

  private reset(): void {
    this.elapsed = 0;
    this.panel.set('threshold', 0.6);
    this.panel.set('intensity', 1.6);
    this.panel.set('spread', 10);
    this.panel.set('bypass', false);
  }

  override update(delta: Seconds): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(scale);

    if (this.playing) {
      this.elapsed += delta;
    }

    this.bloom.threshold = this.panel.values.threshold;
    this.bloom.intensity = this.panel.values.intensity;
    this.bloom.strength = this.panel.values.spread * scale;
    this.stage.filters = this.panel.values.bypass ? [] : [this.bloom];
    this.discs.clear();
    const radius = Math.min(40, width / 20, contentHeight * 0.18);
    LEVELS.forEach((value, index) => {
      const x = (width * (index + 1)) / 7;
      this.discs.fillColor = new Color(value, value, value);
      this.discs.drawCircle(x, contentHeight * 0.4, radius);
      this.labels[index].setPosition(x, contentHeight * 0.4 - radius - 20);
    });
    const x = width * (0.5 + 0.38 * Math.sin(this.elapsed * 0.7));
    this.beam.clear();
    this.beam.fillColor = Color.white;
    this.beam.drawRoundedRectangle(x - 7, contentHeight * 0.66, 14, contentHeight * 0.2, 7);
    this.panel.status(
      `${this.panel.values.bypass ? 'Bypass' : 'Bloom on'} | luminance labels 0-1 | ${this.playing ? 'sweep running' : 'paused'}`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  override destroy(): void {
    this.stage.filters = [];
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { BloomFilterScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(10, 12, 20),
});
await app.start(BloomFilterScene);
