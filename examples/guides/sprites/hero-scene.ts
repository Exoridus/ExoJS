import { type RenderingContext, Scene, Sprite } from '@codexo/exojs';

// #region guide:hero-scene
class HeroScene extends Scene {
  private hero!: Sprite;

  override async load(): Promise<void> {
    await this.loader.load('image/hero.png');
  }

  override init(): void {
    this.hero = new Sprite(this.loader.get('image/hero.png'));
    this.addChild(this.hero);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  private centerHero(): void {
    // #region guide:anchor-center
    const { width, height } = this.app;

    this.hero = new Sprite(this.loader.get('image/hero.png'));
    this.hero.setAnchor(0.5);
    this.hero.setPosition(width / 2, height / 2);
    this.addChild(this.hero);
    // #endregion guide:anchor-center
  }

  private resizeHero(): void {
    // #region guide:size-from-scale
    this.hero.width = 64; // scale.x becomes 64 / textureFrame.width
    this.hero.height = 64; // scale.y becomes 64 / textureFrame.height
    // #endregion guide:size-from-scale
  }
}
// #endregion guide:hero-scene

export { HeroScene };
