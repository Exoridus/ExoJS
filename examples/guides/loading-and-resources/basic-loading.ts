// #region guide:required-scene
import { Scene, Sprite, type RenderingContext, type Texture } from '@codexo/exojs';

export class HeroScene extends Scene {
  private texture!: Texture;

  override async load(): Promise<void> {
    this.texture = await this.loader.load('image/hero.png');
  }

  override init(): void {
    const hero = new Sprite(this.texture);

    hero.setAnchor(0.5).setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(hero);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}
// #endregion guide:required-scene

// #region guide:scope-ownership
import type { LoaderScope } from '@codexo/exojs';

export const demonstrateClaims = async (parent: LoaderScope): Promise<void> => {
  const level = parent.createScope({ name: 'level' });
  const hud = parent.createScope({ name: 'hud' });

  try {
    const texture = level.get('image/hero.png');

    hud.get('image/hero.png');
    await texture.loaded;
    level.destroy();

    console.log(texture.ready); // true: the HUD still holds a claim
  } finally {
    level.destroy(); // repeated destruction is safe
    hud.destroy();
  }
};
// #endregion guide:scope-ownership
