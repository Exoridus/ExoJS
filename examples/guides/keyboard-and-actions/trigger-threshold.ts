import { Keyboard, Scene } from '@codexo/exojs';

// The scene's own player and pause handling: the guide's subject is which
// binding fires, not what it does.
declare const player: { jump: () => void };
declare const togglePause: () => void;

class GameScene extends Scene {
  // #region guide:trigger-threshold
  override init(): void {
    this.inputs.onTrigger(Keyboard.Space, () => {
      player.jump();
    });

    this.inputs.onTrigger(
      Keyboard.Escape,
      () => {
        togglePause();
      },
      { threshold: 200 },
    );
  }
  // #endregion guide:trigger-threshold
}

export { GameScene };
