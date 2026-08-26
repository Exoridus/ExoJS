import { CallbackRenderPass, Color, RenderingContext, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite } from '@codexo/exojs';

// #region guide:trail-pipeline
class TrailScene extends Scene {
  private feedbackRt!: RenderTexture;
  private decay!: Sprite;
  private hero!: Sprite;
  private final!: Sprite;
  private pipeline!: RenderPipeline;

  override init(): void {
    this.feedbackRt = new RenderTexture(800, 600);
    this.decay = new Sprite(this.feedbackRt).setTint(new Color(255, 255, 255, 0.93)); // 93% opaque = 7% fade per frame
    this.hero = new Sprite(this.loader.get('image/hero.png')).setAnchor(0.5);
    this.final = new Sprite(this.feedbackRt);

    this.pipeline = new RenderPipeline()
      // Draw the previous frame (at 93% opacity) plus the hero on top - no clear, so it accumulates
      .addPass(
        new CallbackRenderPass(
          context => {
            context.render(this.decay);
            context.render(this.hero);
          },
          { target: this.feedbackRt },
        ),
      )
      // Display the result
      .addPass(new RenderNodePass(this.final, { clear: Color.black }));
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }
}
// #endregion guide:trail-pipeline

export { TrailScene };
