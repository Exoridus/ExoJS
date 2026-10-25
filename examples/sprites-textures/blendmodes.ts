import {
  Application,
  BlendModes,
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
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, slider, startExample, toggle } from '@examples/runtime';

const BLEND_MODES: Array<{ mode: BlendModes; name: string }> = [
  { mode: BlendModes.Normal, name: 'Normal' },
  { mode: BlendModes.Additive, name: 'Additive' },
  { mode: BlendModes.Subtract, name: 'Subtract' },
  { mode: BlendModes.Multiply, name: 'Multiply' },
  { mode: BlendModes.Screen, name: 'Screen' },
  // Advanced (backdrop-aware) modes - correct coverage, work with alpha.
  { mode: BlendModes.Darken, name: 'Darken' },
  { mode: BlendModes.Lighten, name: 'Lighten' },
  { mode: BlendModes.Overlay, name: 'Overlay' },
  { mode: BlendModes.ColorDodge, name: 'Color Dodge' },
  { mode: BlendModes.ColorBurn, name: 'Color Burn' },
  { mode: BlendModes.HardLight, name: 'Hard Light' },
  { mode: BlendModes.SoftLight, name: 'Soft Light' },
  { mode: BlendModes.Difference, name: 'Difference' },
  { mode: BlendModes.Exclusion, name: 'Exclusion' },
  { mode: BlendModes.Hue, name: 'Hue' },
  { mode: BlendModes.Saturation, name: 'Saturation' },
  { mode: BlendModes.Color, name: 'Color' },
  { mode: BlendModes.Luminosity, name: 'Luminosity' },
];

const controls = {
  mode: choice(
    'Blend mode',
    BLEND_MODES.map(entry => entry.name),
  ),
  alpha: slider('Source alpha', { min: 0, max: 1, step: 0.05, value: 0.7 }),
  background: choice('Background', ['Opaque gray', 'Transparent']),
  motion: toggle('Motion', true),
};
class BlendmodesScene extends Scene {
  private destinations: Sprite[] = [];
  private sources: Sprite[] = [];
  private labels: Text[] = [];
  private readonly backdrop = new Graphics();
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private elapsed = 0;

  override async load(): Promise<void> {
    await this.loader.load(assets.platformerTilesImage);
  }

  override init(): void {
    const texture = this.loader.get(assets.platformerTilesImage);

    for (let i = 0; i < 2; i++) {
      const destination = new Sprite(texture)
        .setTextureFrame(new Rectangle(650, 325, 64, 64))
        .setAnchor(0.5)
        .setTint(new Color(90, 220, 255));
      const source = new Sprite(texture)
        .setTextureFrame(new Rectangle(650, 325, 64, 64))
        .setAnchor(0.5)
        .setTint(new Color(255, 100, 190));
      this.destinations.push(destination);
      this.sources.push(source);
      this.labels.push(new Text('', { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5));
    }

    this.root.addChild(this.backdrop, this.destinations[0], this.sources[0], this.destinations[1], this.sources[1], ...this.labels);
    this.panel = demoPanel({
      title: 'Blend Modes',
      layout: 'bar',
      controls,
      hint: 'Cyan key = destination. Magenta key = source. Linear light, premultiplied alpha.',
      actions: {
        'Fix frame': () => {
          this.panel.set('motion', false);
          this.elapsed = 0;
        },
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Left, () => this.panel.step('mode', -1));
    this.inputs.onTrigger(Keyboard.Right, () => this.panel.step('mode'));
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('motion'));
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerTap.add(this.onTap);
  }

  private readonly onTap = (): void => this.panel.step('mode');

  private reset(): void {
    this.elapsed = 0;
    this.panel.set('mode', 'Normal');
    this.panel.set('alpha', 0.7);
    this.panel.set('background', 'Opaque gray');
  }

  override update(delta: Seconds): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(scale);

    if (this.panel.values.motion) {
      this.elapsed += delta;
    }

    const selected = BLEND_MODES.find(entry => entry.name === this.panel.values.mode)!;
    const size = Math.min(210, contentHeight * 0.85, width * 0.32);
    const offset = size * (0.1 + Math.sin(this.elapsed) * 0.07);
    this.backdrop.clear();

    for (let i = 0; i < 2; i++) {
      const x = width * (i === 0 ? 0.25 : 0.75);
      const y = contentHeight * 0.55;

      if (this.panel.values.background === 'Opaque gray') {
        this.backdrop.fillColor = new Color(112, 112, 112);
        this.backdrop.drawRectangle(x - width * 0.23, 36, width * 0.46, contentHeight - 44);
      }

      this.destinations[i].setPosition(x - offset, y).setScale(size / 64);
      this.sources[i].setPosition(x + offset, y).setScale(size / 64);
      this.sources[i].tint.a = this.panel.values.alpha;
      this.sources[i].blendMode = i === 0 ? BlendModes.Normal : selected.mode;
      this.labels[i].text = i === 0 ? 'Normal reference' : selected.name;
      this.labels[i].setPosition(x, 17);
    }

    this.panel.status(
      `${this.app.backend.backendType} | ${this.panel.values.background} | source alpha ${this.panel.values.alpha.toFixed(2)} | ${selected.name === 'Subtract' ? 'Subtract: Cd * (1 - Cs), not arithmetic subtraction' : 'Destination alpha 1 inside key; transparent outside'} | ${this.panel.values.motion ? 'running' : 'fixed time'}`,
    );
  }

  override draw(context: RenderingContext): void {
    for (const layer of this.root.children) {
      context.render(layer);
    }
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { BlendmodesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.transparent,
});
await startExample(app, () => app.start(BlendmodesScene));
