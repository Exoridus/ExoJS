import { type Application, Scene, Sound, Sprite, Texture } from '@codexo/exojs';

// #region guide:preload
class GameScene extends Scene {
  private hero!: Texture;

  override async load(): Promise<void> {
    const { hero, theme } = await this.assets.load({
      hero: new Texture('hero.png'),
      theme: new Sound('theme.ogg'),
    });

    this.hero = hero;
    this.app.audio.play(theme, { loop: true });
  }

  override init(): void {
    this.root.addChild(new Sprite(this.hero));
  }
}
// #endregion guide:preload

// #region guide:progress
export const preloadWithProgress = async (app: Application, onChange: (fraction: number) => void): Promise<void> => {
  const queue = app.load([new Texture('level-1.png'), new Texture('level-2.png')]);

  queue.onProgress.add(({ loaded, total }) => onChange(total === 0 ? 0 : loaded / total));

  await queue;
};
// #endregion guide:progress

// #region guide:background
export const warmNextLevel = (app: Application): void => {
  void app.loadBackground([new Texture('level-3.png')]);
};
// #endregion guide:background
