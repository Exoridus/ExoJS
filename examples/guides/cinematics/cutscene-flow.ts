import { FadeSceneTransition, GamepadButton, Keyboard, Scene, Sprite, type Voice } from '@codexo/exojs';

import { CinematicScene } from './cinematic-scene';

class GameScene extends Scene {
  private startCutscene(): void {
    // #region guide:enter-cinematic
    // From the game scene - switch to the cinematic:
    void this.app.scenes.change(CinematicScene);
    // #endregion guide:enter-cinematic
  }
}

class CutsceneFlowScene extends Scene {
  private barSize = { v: 70 };
  private musicVoice!: Voice;
  private boss!: Sprite;

  private closeOut(): void {
    // #region guide:return-to-game
    // At the end of the sequence - chain a tween to transition back to the game:
    this.app.tweens
      .create(this.barSize)
      .to({ v: 70 }, 0.6)
      .delay(3.5) // start closing bars after the sequence plays
      .onComplete(() => {
        void this.app.scenes.change(GameScene, { transition: new FadeSceneTransition() });
      })
      .start();
    // #endregion guide:return-to-game
  }

  // #region guide:skip-input
  override init(): void {
    // ... cinematic setup ...

    this.inputs.onTrigger(Keyboard.Space, () => {
      void this.app.scenes.change(GameScene);
    });

    const pad = this.app.input.getGamepad(0);
    pad.onTrigger(GamepadButton.Start, () => {
      void this.app.scenes.change(GameScene);
    });
  }
  // #endregion guide:skip-input

  private skipSmoothly(): void {
    // #region guide:skip-fast-forward
    this.inputs.onTrigger(Keyboard.Space, () => {
      // Jump all tweens to their end state
      this.app.tweens.clear(); // stops all active tweens
      this.musicVoice.volume = 0.85;
      this.boss.setScale(2.1, 2.1);
      // ... snap other properties ...
      void this.app.scenes.change(GameScene);
    });
    // #endregion guide:skip-fast-forward
  }
}

export { CutsceneFlowScene, GameScene };
