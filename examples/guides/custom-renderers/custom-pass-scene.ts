import { CallbackRenderPass, Color, Graphics, RenderingContext, RenderNodePass, RenderPipeline, Scene, type Seconds, Sprite } from '@codexo/exojs';

// #region guide:custom-pass-scene
class CustomPassScene extends Scene {
  private back!: Sprite;
  private front!: Sprite;
  private between!: Graphics;
  private pipeline!: RenderPipeline;
  private angle = 0;

  override init(): void {
    this.back = new Sprite(this.loader.get('image/hero.png')).setAnchor(0.5).setPosition(280, 300);
    this.front = new Sprite(this.loader.get('image/hero.png')).setAnchor(0.5).setPosition(520, 300);
    this.between = new Graphics();

    this.pipeline = new RenderPipeline()
      .addPass(new RenderNodePass(this.back, { clear: Color.black })) // draws behind the pass
      .addPass(
        new CallbackRenderPass(context => {
          this.between.clear();
          this.between.lineWidth = 8;
          this.between.lineColor = new Color(130, 240, 170);
          this.between.drawArc(400, 300, 120, this.angle, this.angle + Math.PI * 1.3);
          this.between.render(context.backend); // low-level draw via context.backend
        }),
      ) // draws between sprites
      .addPass(new RenderNodePass(this.front)); // draws on top
  }

  override update(delta: Seconds): void {
    this.angle += delta * 2.2;
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }
}
// #endregion guide:custom-pass-scene
