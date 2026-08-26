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
}
// #endregion guide:hero-scene

export { HeroScene };
