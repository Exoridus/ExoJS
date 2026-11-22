import {
  Application,
  Color,
  ColorMatrixFilter,
  DataTexture,
  DisplacementFilter,
  Graphics,
  type InteractionEvent,
  type Pointer,
  type RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  ResponsiveCanvasSizing,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  Text,
  type Texture,
  TextureFormat,
  WrapModes,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';

const MAP_SIZE = 256;

const createRippleMap = (): Texture => {
  const data = new Uint8Array(MAP_SIZE * MAP_SIZE * 4);

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const offset = (y * MAP_SIZE + x) * 4;
      const u = (x / MAP_SIZE) * Math.PI * 2;
      const v = (y / MAP_SIZE) * Math.PI * 2;
      data[offset] = Math.round((Math.sin(v * 3) * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((Math.sin(u * 2) * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }

  // The red and green channels are a direction in [-1, 1], so they are numeric
  // data, not colour: a DataTexture is never colour-managed.
  return new DataTexture({
    width: MAP_SIZE,
    height: MAP_SIZE,
    format: TextureFormat.Rgba8,
    data,
    textureOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat, generateMipMap: false },
  });
};

const controls = {
  strength: slider('Ripple strength', { min: 0, max: 18, step: 1, value: 6 }),
  moving: toggle('Motion', true),
};

class WaterMirrorScene extends Scene {
  private target!: RenderTexture;
  private map!: Texture;
  private source!: Sprite;
  private mirror!: Sprite;
  private ripple!: DisplacementFilter;
  private pipeline!: RenderPipeline;
  private readonly water = new Graphics();
  private readonly waterline = new Graphics();
  private readonly reflectionMask = this.track(new Graphics());
  private readonly labels = ['Live scene', 'Reflected capture'].map(
    text => new Text(text, { fillColor: new Color(145, 187, 207), fontSize: 14 }),
  );
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private dragPointer: number | null = null;
  private elapsed = 0;

  override init(): void {
    this.target = this.track(new RenderTexture(this.app.width, this.app.height / 2));
    this.map = this.track(createRippleMap());
    this.source = new Sprite(this.loader.get(assets.ship)).setAnchor(0.5);
    this.mirror = new Sprite(this.target).setScale(1, -1);
    this.ripple = this.track(new DisplacementFilter({ map: this.map, scale: 6 }));
    const tint = this.track(new ColorMatrixFilter().tint(new Color(130, 195, 235)));
    this.mirror.filters = [this.ripple, tint];
    this.mirror.setTint(new Color(255, 255, 255, 0.6));
    this.mirror.mask = this.reflectionMask;
    this.root.addChild(this.water, this.source, this.mirror, this.waterline, ...this.labels);

    // Only the moving subject is captured. Transparent clear keeps the water
    // and the capture's rectangular border out of the displacement filter.
    this.pipeline = this.track(
      new RenderPipeline()
        .addPass(new RenderNodePass(this.source, { target: this.target, clear: Color.transparent }))
        .addPass(new RenderNodePass(this.root)),
    );
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: {
        Calm: () => this.panel.set('strength', 0),
        Ripples: () => this.panel.set('strength', 8),
      },
    });
    this.water.interactive = true;
    this.water.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
    this.app.input.onPointerCancel.add(this.onUp);
    window.addEventListener('blur', this.onBlur);
    this.onSuspend.add(this.onBlur);
  }

  private readonly onDown = (event: InteractionEvent): void => {
    if (event.button === 0 && this.dragPointer === null) {
      this.dragPointer = event.pointer.id;
      this.onMove(event.pointer, event.x);
    }
  };
  private readonly onMove = (pointer: Pointer, x: number): void => {
    if (pointer.id === this.dragPointer) {
      this.panel.set('strength', Math.round(Math.max(0, Math.min(1, x / this.app.width)) * 18));
    }
  };
  private readonly onUp = (pointer: Pointer): void => {
    if (pointer.id === this.dragPointer) {
      this.onBlur();
    }
  };
  private readonly onBlur = (): void => {
    this.dragPointer = null;
  };

  override update(delta: Seconds): void {
    // This layout uses top-left coordinates even as the host changes aspect.
    this.app.rendering.view.setCenter(this.app.width / 2, this.app.height / 2);
    const { scale, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const width = this.app.width;
    const height = contentHeight * scale;
    const horizon = Math.round(height * 0.52);

    if (this.target.height !== horizon || this.target.width !== width) {
      this.target.resize(width, Math.max(1, horizon));
      this.target.view.reset(width / 2, horizon / 2, width, Math.max(1, horizon));
      this.mirror.resetTextureFrame().setScale(1, -1);
    }

    if (this.panel.values.moving) {
      this.elapsed += delta;
      this.ripple.offsetU += delta * 0.045;
      this.ripple.offsetV += delta * 0.07;
    }

    const size = Math.min(width * 0.2, horizon * 0.52);
    this.source
      .setScale(size / 64)
      .setPosition(width * (0.5 + Math.sin(this.elapsed * 0.55) * 0.23), horizon * 0.57 + Math.sin(this.elapsed) * horizon * 0.07);
    this.mirror.setPosition(0, horizon * 2);
    this.ripple.setScale(this.panel.values.strength * scale);
    this.water.clear();
    this.water.fillColor = new Color(24, 61, 80);
    this.water.drawRectangle(0, horizon, width, Math.max(1, height - horizon));
    this.waterline.clear();
    this.waterline.lineWidth = scale;
    this.waterline.lineColor = new Color(97, 165, 186);
    this.waterline.drawLine(0, horizon, width, horizon);
    this.reflectionMask.clear();
    this.reflectionMask.fillColor = Color.white;
    this.reflectionMask.drawRectangle(0, horizon, width, Math.max(1, height - horizon));
    this.labels[0].setPosition(16 * scale, 14 * scale).setScale(scale);
    this.labels[1].setPosition(16 * scale, horizon + 14 * scale).setScale(scale);
    this.panel.status(
      `${this.panel.values.moving ? 'Moving' : 'Paused'} | ${this.panel.values.strength === 0 ? 'Calm reflection' : 'Rippling reflection'} | drag the water: calm left, waves right`,
    );
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }

  override destroy(): void {
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    this.app.input.onPointerCancel.remove(this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

const app = new Application({
  scenes: { WaterMirrorScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new ResponsiveCanvasSizing({ minAspect: 1 }),
  },
  clearColor: new Color(18, 32, 47),
});

await startExample(app, () => app.start(WaterMirrorScene));
