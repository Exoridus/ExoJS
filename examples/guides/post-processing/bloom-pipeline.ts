import {
  BlendModes,
  BlurFilter,
  CallbackRenderPass,
  Color,
  RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  Scene,
  Sprite,
} from '@codexo/exojs';

// #region guide:bloom-pipeline
class BloomScene extends Scene {
  private baseRt!: RenderTexture;
  private glowRt!: RenderTexture;
  private blurredRt!: RenderTexture;
  private bunny!: Sprite;
  private baseSprite!: Sprite;
  private glowSprite!: Sprite;
  private blur!: BlurFilter;
  private pipeline!: RenderPipeline;

  override init(): void {
    this.baseRt = new RenderTexture(800, 600);
    this.glowRt = new RenderTexture(800, 600);
    this.blurredRt = new RenderTexture(800, 600);

    this.bunny = new Sprite(this.loader.get('image/bunny.png')).setAnchor(0.5);
    this.baseSprite = new Sprite(this.baseRt);
    this.glowSprite = new Sprite(this.blurredRt).setTint(new Color(255, 255, 255, 0.8)).setBlendMode(BlendModes.Additive);

    this.blur = new BlurFilter({ radius: 10, quality: 2 });

    this.pipeline = new RenderPipeline()
      // Pass 1: base scene at normal tint, into baseRt
      .addPass(
        new CallbackRenderPass(
          context => {
            this.bunny.setTint(Color.white);
            context.render(this.bunny);
          },
          { target: this.baseRt, clear: Color.black },
        ),
      )
      // Pass 2: glow scene - same geometry, bright warm tint, into glowRt
      .addPass(
        new CallbackRenderPass(
          context => {
            this.bunny.setTint(new Color(255, 230, 190));
            context.render(this.bunny);
          },
          { target: this.glowRt, clear: Color.black },
        ),
      )
      // Pass 3: blur the glow
      .addPass(new CallbackRenderPass(context => this.blur.apply(context.backend, this.glowRt, this.blurredRt)))
      // Composite: base + blurred glow (additive)
      .addPass(new RenderNodePass(this.baseSprite, { clear: Color.black }))
      .addPass(new RenderNodePass(this.glowSprite));
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }
}
// #endregion guide:bloom-pipeline

export { BloomScene };
