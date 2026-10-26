import {
  Application,
  Color,
  DropShadowFilter,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, mountControls, slider, toggle } from '@examples/runtime';

const SHIP = assets.ship;

class DropShadowFilterScene extends Scene {
  private shadow!: DropShadowFilter;
  private sprite!: Sprite;
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof demoPanel>;

  override init(): void {
    const { width, height } = this.app;

    // A shadow that trails the ship down and to the right, soft enough to read
    // as depth rather than as a second sprite.
    this.shadow = new DropShadowFilter({ offsetX: 12, offsetY: 16, blur: 6, quality: 2, color: new Color(0, 0, 0, 0.6) });
    this.sprite = new Sprite(this.loader.get(SHIP))
      .setAnchor(0.5)
      .setScale(10)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.shadow];

    this.hud = mountControls({
      title: 'Drop Shadow Filter',
      hint: "The shadow is the sprite's silhouette, blurred and offset, drawn behind the unchanged sprite.",
      status: this.statusText(),
    });

    this.panel = demoPanel({
      scene: this,
      title: 'Shadow',
      controls: {
        offsetX: slider('Offset X', { min: -40, max: 40, step: 1, value: this.shadow.offsetX }),
        offsetY: slider('Offset Y', { min: -40, max: 40, step: 1, value: this.shadow.offsetY }),
        blur: slider('Blur', { min: 0, max: 24, step: 0.5, value: this.shadow.blur }),
        opacity: slider('Opacity', { min: 0, max: 1, step: 0.05, value: this.shadow.color.a }),
        shadowOnly: toggle('Shadow only'),
      },
      onChange: (_key, _value, values) => {
        this.shadow.offsetX = values.offsetX;
        this.shadow.offsetY = values.offsetY;
        this.shadow.blur = values.blur;
        this.shadow.color = new Color(0, 0, 0, values.opacity);
        this.shadow.shadowOnly = values.shadowOnly;
        this.refresh();
      },
    });
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;
    this.sprite.setRotation(Math.sin(this.elapsed * 0.8) * 20);
  }

  private statusText(): string {
    const { offsetX, offsetY, blur } = this.shadow;

    return `offset ${offsetX}, ${offsetY} · blur ${blur.toFixed(1)} · opacity ${this.shadow.color.a.toFixed(2)}`;
  }

  private refresh(): void {
    this.hud.setStatus(this.statusText());
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { DropShadowFilterScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(30, 34, 44),
});

await app.start(DropShadowFilterScene);
