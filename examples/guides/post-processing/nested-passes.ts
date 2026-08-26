import {
  BlurFilter,
  CallbackRenderPass,
  Color,
  ColorMatrixFilter,
  Graphics,
  RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  Scene,
  Sprite,
} from '@codexo/exojs';

// #region guide:nested-passes
class FilterChainScene extends Scene {
  private scene!: Graphics;
  private sceneRt!: RenderTexture;
  private tmpRt!: RenderTexture;
  private outRt!: RenderTexture;
  private blur!: BlurFilter;
  private color!: ColorMatrixFilter;
  private final!: Sprite;
  private pipeline!: RenderPipeline;

  override init(): void {
    this.scene = new Graphics();
    this.sceneRt = new RenderTexture(800, 600);
    this.tmpRt = new RenderTexture(800, 600);
    this.outRt = new RenderTexture(800, 600);
    this.blur = new BlurFilter({ radius: 6, quality: 2 });
    this.color = new ColorMatrixFilter().tint(new Color(140, 190, 255));
    this.final = new Sprite(this.outRt);

    this.pipeline = new RenderPipeline()
      // Render scene → sceneRt
      .addPass(new RenderNodePass(this.scene, { target: this.sceneRt, clear: Color.black }))
      // sceneRt → blur → tmpRt
      .addPass(new CallbackRenderPass(context => this.blur.apply(context.backend, this.sceneRt, this.tmpRt)))
      // tmpRt → color → outRt
      .addPass(new CallbackRenderPass(context => this.color.apply(context.backend, this.tmpRt, this.outRt)))
      // Display outRt
      .addPass(new RenderNodePass(this.final, { clear: Color.black }));
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }
}
// #endregion guide:nested-passes

export { FilterChainScene };
