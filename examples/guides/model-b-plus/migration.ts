import { Application, Scene, Sprite, type Texture } from '@codexo/exojs';

// #region guide:before-lazy
class LegacyScene extends Scene {
  private hero!: Texture;

  override async load(): Promise<void> {
    this.hero = await this.loader.load({ type: 'texture', source: 'hero.png' });
  }

  override init(): void {
    this.root.addChild(new Sprite(this.hero));
  }
}
// #endregion guide:before-lazy

// #region guide:after-lazy
class ModernScene extends Scene {
  override init(): void {
    this.root.addChild(new Sprite('hero.png'));
  }
}
// #endregion guide:after-lazy

// #region guide:after-ownership
export const swapHero = (scene: Scene, current: Sprite): Sprite => {
  const next = new Sprite('hero-damaged.png');

  try {
    scene.root.addChild(next);
  } catch (error) {
    next.destroy();

    throw error;
  }

  current.destroy();

  return next;
};
// #endregion guide:after-ownership

export const app = new Application({ scenes: { LegacyScene, ModernScene } });
