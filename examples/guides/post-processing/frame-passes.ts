import { BloomFilter, Color, FilterPass, Scene, Sprite } from '@codexo/exojs';

// #region guide:frame-passes
class GlowingScene extends Scene {
  private bloom!: BloomFilter;
  private pass!: FilterPass;

  override init(): void {
    this.addChild(
      new Sprite(this.loader.get('image/bunny.png'))
        .setAnchor(0.5)
        .setPosition(400, 300)
        .setTint(new Color(255, 240, 200)),
    );

    this.bloom = new BloomFilter({ threshold: 0.7, intensity: 1.3, strength: 10 });
    // The frame is drawn into `app.frameTexture` while this pass is registered,
    // and the pass turns that image into the frame the canvas shows.
    this.pass = new FilterPass(this.app.frameTexture, this.bloom, { resolution: this.app.pixelRatio });

    this.app.framePasses.addPass(this.pass);
  }

  override destroy(): void {
    // The pipeline outlives the scene, so a scene-owned pass is removed with it.
    this.app.framePasses.removePass(this.pass);
    this.pass.destroy();
    this.bloom.destroy();
    super.destroy();
  }
}
// #endregion guide:frame-passes

export { GlowingScene };
