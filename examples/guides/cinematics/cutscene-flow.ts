import { FadeSceneTransition, GamepadButton, Keyboard, Scene } from '@codexo/exojs';

import { CinematicScene } from './cinematic-scene';

class GameScene extends Scene {
  private startCutscene(): void {
    // #region guide:enter-cinematic
    // From the game scene - switch to the cinematic:
    void this.app.scenes.change(CutsceneFlowScene);
    // #endregion guide:enter-cinematic
  }
}

class CutsceneFlowScene extends CinematicScene {
  private leaving = false;

  private closeOut(): void {
    // #region guide:return-to-game
    // At the end of the sequence - chain a tween to transition back to the game:
    this.sequenceTweens.push(
      this.tweens
        .create(this.barSize)
        .to({ v: 70 }, 0.6)
        .delay(3.5) // start closing bars after the sequence plays
        .onComplete(() => this.finish())
        .start(),
    );
    // #endregion guide:return-to-game
  }

  // #region guide:skip-input
  override init(): void {
    super.init();
    this.closeOut();
    this.inputs.onTrigger([Keyboard.Space, Keyboard.Enter, GamepadButton.Start], () => this.finish());
  }
  // #endregion guide:skip-input

  // #region guide:skip-stop-snap
  private finish(): void {
    if (this.leaving) {
      return;
    }

    this.leaving = true;
    this.stopAndSnap();
    void this.app.scenes.change(GameScene, { transition: new FadeSceneTransition() });
  }
  // #endregion guide:skip-stop-snap
}

export { CutsceneFlowScene, GameScene };
