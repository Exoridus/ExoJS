import {
  Application,
  BlurFilter,
  CallbackRenderPass,
  Color,
  ColorMatrixFilter,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  Scene,
  type Seconds,
  Sprite,
} from '@codexo/exojs';

class PostProcessingChainScene extends Scene {
  private scene!: Graphics;
  private a!: RenderTexture;
  private b!: RenderTexture;
  private c!: RenderTexture;
  private blur!: BlurFilter;
  private color!: ColorMatrixFilter;
  private final!: Sprite;
  private pipeline!: RenderPipeline;
  private time = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.scene = new Graphics();
    this.a = new RenderTexture(width, height);
    this.b = new RenderTexture(width, height);
    this.c = new RenderTexture(width, height);
    this.blur = new BlurFilter({ radius: 6, quality: 2 });
    this.color = new ColorMatrixFilter().tint(new Color(140, 190, 255));
    this.final = new Sprite(this.c);

    // Configured once: scene → off-screen, two filter passes, composite to the canvas.
    this.pipeline = new RenderPipeline()
      .addPass(new RenderNodePass(this.scene, { target: this.a, clear: Color.black }))
      .addPass(new CallbackRenderPass(context => this.blur.apply(context.backend, this.a, this.b)))
      .addPass(new CallbackRenderPass(context => this.color.apply(context.backend, this.b, this.c)))
      .addPass(new RenderNodePass(this.final, { clear: Color.black }));
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;
    this.time += delta;
    this.scene.clear();
    this.scene.fillColor = new Color(80, 130, 255);
    this.scene.drawCircle(width / 2 + Math.cos(this.time * 1.6) * (width * 0.32), height / 2 + Math.sin(this.time * 1.8) * (height * 0.32), 78);
    this.scene.fillColor = new Color(255, 170, 90);
    this.scene.drawCircle(width / 2 + Math.cos(this.time * 1.2 + 1) * (width * 0.3), height / 2 + Math.sin(this.time * 1.3 + 0.7) * (height * 0.34), 54);
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }

  override destroy(): void {
    // Pipeline cascades destroy() to its passes; the caller-owned targets and filters it created are freed here.
    this.pipeline.destroy();
    this.a.destroy();
    this.b.destroy();
    this.c.destroy();
    this.blur.destroy();
    this.color.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PostProcessingChainScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

await app.start(PostProcessingChainScene);
