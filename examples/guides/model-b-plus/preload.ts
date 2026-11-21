import { type Application, Keyboard, Scene, SceneAvailability, Sound, Sprite, Texture, type Voice } from '@codexo/exojs';

// #region guide:preload
class GameScene extends Scene {
  private hero!: Texture;
  private theme!: Sound;
  private themeVoice: Voice | null = null;

  override async load(): Promise<void> {
    const { hero, theme } = await this.assets.load({
      hero: new Texture('hero.png'),
      theme: new Sound('theme.ogg'),
    });

    this.hero = hero;
    this.theme = theme;
  }

  override init(): void {
    this.root.addChild(new Sprite(this.hero));
    this.inputs.onStart(Keyboard.Space, () => {
      if (!this.app.audio.locked) {
        this.themeVoice?.stop();
        this.themeVoice = this.audio.play(this.theme, { loop: true, when: SceneAvailability.Active });
      }
    });
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
  void app.loadBackground([new Texture('level-3.png')]).catch(error => {
    console.error('Next level prefetch failed', error);
  });
};
// #endregion guide:background
