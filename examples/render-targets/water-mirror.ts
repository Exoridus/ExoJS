import {
  Application,
  CallbackRenderPass,
  Color,
  ColorMatrixFilter,
  DisplacementFilter,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  Texture,
  WrapModes,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const MAP_SIZE = 256;

const createRippleMap = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context unavailable.');
  }

  const image = context.createImageData(MAP_SIZE, MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const offset = (y * MAP_SIZE + x) * 4;
      const u = (x / MAP_SIZE) * Math.PI * 2;
      const v = (y / MAP_SIZE) * Math.PI * 2;
      image.data[offset] = Math.round((Math.sin(v * 3) * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round((Math.sin(u * 2) * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat, generateMipMap: false });
};

class WaterMirrorScene extends Scene {
  private target!: RenderTexture;
  private map!: Texture;
  private source!: Sprite;
  private mirror!: Sprite;
  private ripple!: DisplacementFilter;
  private tint!: ColorMatrixFilter;
  private waterline!: Graphics;
  private pipeline!: RenderPipeline;
  private hud!: ReturnType<typeof mountControls>;
  private dragging = false;
  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => {
    if (y < this.app.height / 2) {
      return;
    }
    this.dragging = true;
    this.setRippleStrength(x);
  };
  private readonly onPointerMove = (_pointer: unknown, x: number): void => {
    if (this.dragging) {
      this.setRippleStrength(x);
    }
  };
  private readonly onPointerEnd = (): void => {
    this.dragging = false;
  };

  override init(): void {
    const { width, height } = this.app;
    const half = height / 2;
    this.target = new RenderTexture(width, half);
    this.map = createRippleMap();
    this.source = new Sprite(this.loader.get('image/ship-a.png'))
      .setAnchor(0.5)
      .setPosition(width / 2, half / 2)
      .setScale(5);
    this.mirror = new Sprite(this.target).setPosition(0, height).setScale(1, -1);
    this.ripple = new DisplacementFilter({ map: this.map, scale: 24 });
    this.tint = new ColorMatrixFilter().tint(new Color(130, 195, 235));
    this.mirror.filters = [this.ripple, this.tint];

    this.waterline = new Graphics();
    this.waterline.lineColor = new Color(100, 205, 245);
    this.waterline.lineWidth = 3;
    this.waterline.drawLine(0, half, width, half);

    this.pipeline = new RenderPipeline()
      .addPass(
        new CallbackRenderPass(
          context => {
            context.backend.clear();
            context.render(this.source);
          },
          { target: this.target },
        ),
      )
      .addPass(new RenderNodePass(this.source, { clear: new Color(18, 24, 36) }))
      .addPass(new RenderNodePass(this.mirror));

    this.hud = mountControls({
      title: 'Water Reflection and Distortion',
      controls: [{ keys: 'Drag on water', action: 'change ripple strength' }],
      status: 'Ripple strength: 24',
      hint: 'The upper scene is captured into a RenderTexture, flipped, then displaced by a scrolling direction map. Drag across the reflection to change its strength.',
    });
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerUp.add(this.onPointerEnd);
    this.app.input.onPointerCancel.add(this.onPointerEnd);
  }

  private setRippleStrength(x: number): void {
    const strength = Math.round(Math.max(0, Math.min(1, x / this.app.width)) * 60);
    this.ripple.setScale(strength);
    this.hud.setStatus(`Ripple strength: ${strength}`);
  }

  override update(delta: Seconds): void {
    const { width, height } = this.app;
    const time = this.app.activeSeconds;
    const quarter = height / 4;
    this.source.setPosition(width / 2 + Math.cos(time * 1.7) * (width * 0.3), quarter + Math.sin(time * 1.3) * (quarter * 0.55));
    this.ripple.offsetU += delta * 0.08;
    this.ripple.offsetV += delta * 0.13;
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
    context.render(this.waterline);
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerUp.remove(this.onPointerEnd);
    this.app.input.onPointerCancel.remove(this.onPointerEnd);
    this.hud.dispose();
    this.pipeline.destroy();
    this.target.destroy();
    this.ripple.destroy();
    this.tint.destroy();
    this.map.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { WaterMirrorScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});

await app.start(WaterMirrorScene);
