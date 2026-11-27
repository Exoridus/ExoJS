// #region guide:scene-navigation
import {
  Application,
  Button,
  Color,
  Label,
  LoadingSceneTransition,
  Scene,
  SceneAvailability,
  SceneNavigationAbortedError,
  Sound,
  Sprite,
  Stack,
  Texture,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class MenuScene extends Scene {
  private busy = false;

  override init(): void {
    const menu = new Stack({ direction: 'column', spacing: 12, padding: 20 });
    const warm = new Button({ label: 'Preload level', width: 260 });
    const enter = new Button({ label: 'Enter level', width: 260 });
    const status = new Label('Preloading prepares assets without playing audio.');

    const run = async (navigate: boolean): Promise<void> => {
      if (this.busy) {
        return;
      }

      this.busy = true;
      status.text = navigate ? 'Opening level...' : 'Preparing level...';

      try {
        if (navigate) {
          await this.app.scenes.change(LevelScene, { transition: new LoadingSceneTransition() });
        } else {
          await this.app.scenes.preload(LevelScene);

          if (!this.lifecycleSignal.aborted) {
            status.text = 'Ready. Enter the level when you want.';
          }
        }
      } catch (error) {
        if (!this.lifecycleSignal.aborted) {
          status.text = error instanceof SceneNavigationAbortedError ? 'Navigation was aborted.' : 'Loading failed; try again.';
        }

        if (!(error instanceof SceneNavigationAbortedError)) {
          console.error('Level preparation or navigation failed', error);
        }
      } finally {
        this.busy = false;
      }
    };

    warm.onClick.add(() => void run(false));
    enter.onClick.add(() => void run(true));
    menu.addItem(warm).addItem(enter).addItem(status);
    menu.anchorIn(this.ui, 'center');
    this.ui.addChild(menu);
  }
}

class LevelScene extends Scene {
  private readonly hero = new Texture(assets.spaceShipBlue.source);
  private readonly chime = new Sound(assets.soundUiConfirm.source);
  private readonly playEntrySound = (): void => {
    if (!this.lifecycleSignal.aborted) {
      this.audio.play(this.chime, { when: SceneAvailability.Active });
    }
  };

  override async load(): Promise<void> {
    await this.assets.load({ hero: this.hero, chime: this.chime });
  }

  override init(): void {
    this.root.addChild(new Sprite(this.hero).setAnchor(0.5).setPosition(400, 180));
    const replay = new Button({ label: 'Play loaded sound', width: 260 });
    const back = new Button({ label: 'Return to menu', width: 260 });

    replay.anchorIn(this.ui, 'center', 0, 30);
    back.anchorIn(this.ui, 'center', 0, 90);
    replay.onClick.add(() => this.app.audio.onUnlock.add(this.playEntrySound));
    back.onClick.add(() => {
      void this.app.scenes.change(MenuScene).catch(error => console.error('Return to menu failed', error));
    });
    this.ui.addChild(replay, back);
    // Preload may run init, so start only after activation and browser unlock.
    this.onActivate.add(() => this.app.audio.onUnlock.add(this.playEntrySound));
  }

  override destroy(): void {
    this.app.audio.onUnlock.remove(this.playEntrySound);
  }
}

const app = new Application({
  scenes: { MenuScene, LevelScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(MenuScene);
// #endregion guide:scene-navigation
