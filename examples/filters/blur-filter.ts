import { Application, BlurFilter, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

// High-detail, high-contrast content so the blur visibly softens hard edges.
const PIXEL_GRID = assets.technical.filtering.pixelGrid128;

const MAX_STRENGTH = 8;

class BlurFilterScene extends Scene {
  private blur!: BlurFilter;
  private sprite!: Sprite;
  private enabled = true;
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;
  private slider!: ReturnType<ReturnType<typeof mountControlPanel>['addSlider']>;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.blur = new BlurFilter({ strength: 2 });
    this.sprite = new Sprite(this.loader.get(PIXEL_GRID))
      .setAnchor(0.5)
      .setScale(4.5)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.blur];

    this.hud = mountControls({
      title: 'Blur Filter',
      controls: [
        { keys: 'Strength', action: 'soften the sprite (Gaussian standard deviation)' },
        { keys: 'Filter', action: 'toggle to compare before / after' },
      ],
      status: this.statusText(),
      hint: 'Drag the Strength slider — the live value is shown to its right.',
    });

    this.panel = mountControlPanel({ title: 'Blur' });
    this.slider = this.panel.addSlider({
      label: 'Strength',
      min: 0,
      max: MAX_STRENGTH,
      step: 0.1,
      value: this.blur.strength,
      onChange: value => {
        this.blur.strength = value;
        this.refresh();
      },
    });
    this.panel.addToggle({
      label: 'Filter',
      value: true,
      onChange: on => {
        this.enabled = on;
        this.sprite.filters = on ? [this.blur] : [];
        this.refresh();
      },
    });
  }

  private statusText(): string {
    if (!this.enabled) {
      return 'Filter: OFF (original sprite)';
    }

    return `Strength: ${this.blur.strength.toFixed(1)} px`;
  }

  private refresh(): void {
    this.hud.setStatus(this.statusText());
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { BlurFilterScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(BlurFilterScene);
