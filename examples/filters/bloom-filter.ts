import { Application, BloomFilter, Color, Container, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

/**
 * Six discs of rising luminance on a dark backdrop. Only the ones above the
 * threshold glow, so dragging Threshold walks the glow along the row and shows
 * what the filter is actually selecting on.
 */
const DISCS = [
  new Color(40, 46, 70),
  new Color(70, 90, 140),
  new Color(110, 150, 210),
  new Color(160, 210, 255),
  new Color(225, 245, 255),
  new Color(255, 255, 255),
];

const DISC_RADIUS = 48;

class BloomFilterScene extends Scene {
  private bloom!: BloomFilter;
  private stage!: Container;
  private discs!: Graphics;
  private beam!: Graphics;
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;

  override init(): void {
    const { width, height } = this.app;

    this.bloom = new BloomFilter({ threshold: 0.6, intensity: 1.6, strength: 10, levels: 3 });
    this.discs = new Graphics();
    this.beam = new Graphics();
    // One filter over the whole stage rather than one per shape: bloom reads
    // the composed image, so a highlight next to another highlight glows as one
    // light rather than as two that happen to overlap.
    this.stage = new Container();
    this.stage.addChild(this.discs);
    this.stage.addChild(this.beam);
    this.stage.filters = [this.bloom];

    const spacing = width / (DISCS.length + 1);

    for (let index = 0; index < DISCS.length; index++) {
      this.discs.fillColor = DISCS[index]!;
      this.discs.drawCircle(spacing * (index + 1), height * 0.38, DISC_RADIUS);
    }

    this.hud = mountControls({
      title: 'Bloom Filter',
      controls: [
        { keys: 'Threshold', action: 'luminance a pixel needs before it glows' },
        { keys: 'Intensity', action: 'how much of the extracted highlight is added back' },
        { keys: 'Strength', action: 'how far the glow spreads, in logical units' },
        { keys: 'Levels', action: 'halvings before the blur - wider and cheaper, or tighter' },
      ],
      status: this.statusText(),
      hint: 'The discs get brighter from left to right. Raise Threshold and watch the glow retreat along the row.',
    });

    this.panel = mountControlPanel({ title: 'Bloom' });
    this.panel.addSlider({
      label: 'Threshold',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.bloom.threshold,
      onChange: value => {
        this.bloom.threshold = value;
        this.refresh();
      },
    });
    this.panel.addSlider({
      label: 'Intensity',
      min: 0,
      max: 4,
      step: 0.1,
      value: this.bloom.intensity,
      onChange: value => {
        this.bloom.intensity = value;
        this.refresh();
      },
    });
    this.panel.addSlider({
      label: 'Strength',
      min: 0,
      max: 32,
      step: 1,
      value: this.bloom.strength,
      onChange: value => {
        this.bloom.strength = value;
        this.refresh();
      },
    });
    this.panel.addSlider({
      label: 'Levels',
      min: 1,
      max: 5,
      step: 1,
      value: this.bloom.levels,
      onChange: value => {
        this.bloom.levels = value;
        this.refresh();
      },
    });
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;
  }

  private statusText(): string {
    const { threshold, intensity, strength, levels } = this.bloom;

    return `threshold ${threshold.toFixed(2)} · intensity ${intensity.toFixed(1)} · strength ${strength.toFixed(0)} · levels ${levels}`;
  }

  private refresh(): void {
    this.hud.setStatus(this.statusText());
  }

  override draw(context: RenderingContext): void {
    const { width, height } = this.app;
    // A sweeping white bar: a moving highlight shows the glow tracking it,
    // which a still image cannot.
    const x = width * (0.5 + 0.42 * Math.sin(this.elapsed * 0.7));

    this.beam.clear();
    this.beam.fillColor = Color.white;
    this.beam.drawRoundedRectangle(x - 14, height * 0.62, 28, height * 0.24, 14);

    context.render(this.stage);
  }
}

const app = new Application({
  scenes: { BloomFilterScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});

await app.start(BloomFilterScene);
