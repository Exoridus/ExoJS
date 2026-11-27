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
  Text,
} from '@codexo/exojs';
import { demoPanel, slider, startExample } from '@examples/runtime';

// Threshold uses linear luminance: encoded gray 128 is approximately 0.22, not 0.5.
const LEVELS = [40, 90, 140, 190, 225, 255];
const controls = {
  threshold: slider('Threshold', { min: 0, max: 1, step: 0.05, value: 0.6 }),
};
class BloomFilterScene extends Scene {
  private readonly bloom = this.track(new BloomFilter({ threshold: 0.6, intensity: 1.6, strength: 10, levels: 3 }));
  private readonly stage = new Container();
  private readonly discs = new Graphics();
  private labels: Text[] = [];
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private bloomEnabled = true;
  private layoutWidth = 0;
  private layoutHeight = 0;

  override init(): void {
    this.stage.addChild(this.discs);
    this.stage.filters = [this.bloom];
    this.discs.interactive = true;
    this.discs.onPointerTap.add(this.toggleBloom);
    this.root.addChild(this.stage);
    this.labels = LEVELS.map(value => {
      const channel = value / 255;
      const luminance = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

      return new Text(luminance.toFixed(2), { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5);
    });
    this.root.addChild(...this.labels);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
    });
    this.inputs.onTrigger(Keyboard.Space, this.toggleBloom);
  }

  private readonly toggleBloom = (): void => {
    this.bloomEnabled = !this.bloomEnabled;
    this.stage.filters = this.bloomEnabled ? [this.bloom] : [];
  };

  override update(): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(scale);

    this.bloom.threshold = this.panel.values.threshold;
    this.bloom.strength = 10 * scale;
    this.panel.status(this.bloomEnabled ? 'Bloom on' : 'Bloom off');

    if (this.layoutWidth === width && this.layoutHeight === contentHeight) {
      return;
    }

    this.layoutWidth = width;
    this.layoutHeight = contentHeight;
    this.discs.clear();
    const radius = Math.min(40, width / 20, contentHeight * 0.18);
    const centerY = Math.max(radius + 32, contentHeight / 2);
    LEVELS.forEach((value, index) => {
      const x = (width * (index + 1)) / 7;
      this.discs.fillColor = new Color(value, value, value);
      this.discs.drawCircle(x, centerY, radius);
      this.labels[index].setPosition(x, centerY - radius - 20);
    });
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
await startExample(app, () => app.start(BloomFilterScene));
