import {
  BlurFilter,
  CallbackRenderPass,
  Color,
  Container,
  RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  Scene,
  Sprite,
} from '@codexo/exojs';

// #region guide:blur-pipeline
class PostProcessScene extends Scene {
  private sceneRt!: RenderTexture;
  private blurredRt!: RenderTexture;
  private blur!: BlurFilter;
  private worldLayer!: Container;
  private final!: Sprite;
  private pipeline!: RenderPipeline;

  override init(): void {
    this.sceneRt = new RenderTexture(800, 600);
    this.blurredRt = new RenderTexture(800, 600);
    this.blur = new BlurFilter({ radius: 4, quality: 2 });
    this.worldLayer = new Container();
    this.final = new Sprite(this.blurredRt);

    this.pipeline = new RenderPipeline()
      // 1. Render the full scene into sceneRt
      .addPass(new RenderNodePass(this.worldLayer, { target: this.sceneRt, clear: Color.black }))
      // 2. Apply blur: sceneRt → filter → blurredRt
      .addPass(new CallbackRenderPass(context => this.blur.apply(context.backend, this.sceneRt, this.blurredRt)))
      // 3. Display the result on the canvas
      .addPass(new RenderNodePass(this.final, { clear: Color.black }));
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }
}
// #endregion guide:blur-pipeline

export { PostProcessScene };
