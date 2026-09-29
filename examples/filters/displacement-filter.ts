import {
  Application,
  Color,
  DataTexture,
  DisplacementFilter,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  type Texture,
  TextureFormat,
  WrapModes,
} from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const SHIP = assets.demo.textures.shipA;
const MAP_SIZE = 256;

// The displacement map: red is the horizontal direction, green the vertical,
// both decoded from [0, 1] to [-1, 1], so flat (0.5, 0.5) grey means "stay
// put". Two sine waves at right angles make the classic water ripple; scrolling
// the sampling offset moves the ripple without redrawing the map.
const rippleMap = (): Texture => {
  const data = new Uint8Array(MAP_SIZE * MAP_SIZE * 4);

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const offset = (y * MAP_SIZE + x) * 4;
      const u = (x / MAP_SIZE) * Math.PI * 2;
      const v = (y / MAP_SIZE) * Math.PI * 2;

      data[offset] = Math.round((Math.sin(v * 3) * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((Math.sin(u * 2) * 0.5 + 0.5) * 255);
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }

  // The channels are a direction in [-1, 1], so they are numeric data, not
  // colour: a DataTexture is never colour-managed. Repeat, so a scrolling
  // sampling offset never runs off the edge of the map.
  return new DataTexture({
    width: MAP_SIZE,
    height: MAP_SIZE,
    format: TextureFormat.Rgba8,
    data,
    textureOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat, generateMipMap: false },
  });
};

class DisplacementFilterScene extends Scene {
  private ripple!: DisplacementFilter;
  private map!: Texture;
  private sprite!: Sprite;
  private scrolling = true;
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;

  override init(): void {
    const { width, height } = this.app;

    this.map = rippleMap();
    this.ripple = new DisplacementFilter({ map: this.map, scale: 24 });
    this.sprite = new Sprite(this.loader.get(SHIP))
      .setAnchor(0.5)
      .setScale(10)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.ripple];

    this.hud = mountControls({
      title: 'Displacement Filter',
      hint: 'Each fragment reads its colour from a direction stored in a map texture, so the sprite ripples like a reflection on water.',
      status: this.statusText(),
    });

    this.panel = mountControlPanel({ title: 'Ripple' });
    this.panel.addSlider({
      label: 'Scale',
      min: 0,
      max: 80,
      step: 1,
      value: this.ripple.scaleX,
      onChange: value => {
        this.ripple.setScale(value);
        this.refresh();
      },
    });
    this.panel.addToggle({
      label: 'Scroll',
      value: this.scrolling,
      onChange: on => {
        this.scrolling = on;
      },
    });
  }

  override update(delta: Seconds): void {
    if (!this.scrolling) return;

    this.ripple.offsetU += delta * 0.08;
    this.ripple.offsetV += delta * 0.13;
    this.refresh();
  }

  private statusText(): string {
    return `scale ${this.ripple.scaleX.toFixed(0)} · map offset ${this.ripple.offsetU.toFixed(2)}, ${this.ripple.offsetV.toFixed(2)}`;
  }

  private refresh(): void {
    this.hud.setStatus(this.statusText());
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { DisplacementFilterScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(18, 30, 46),
  loader: {
    basePath: 'assets/',
  },
});

await app.start(DisplacementFilterScene);
