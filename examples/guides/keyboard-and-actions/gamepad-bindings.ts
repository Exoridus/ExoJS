import { GamepadAxis, GamepadButton, type InputBinding, Scene } from '@codexo/exojs';

interface Player {
  jump(): void;
}

class PadScene extends Scene {
  private _padBindings: InputBinding[] = [];
  private move = { x: 0, y: 0 };
  private player!: Player;

  // #region guide:pad-binding-lifetime
  override init(): void {
    this._padBindings = [];
    const pad = this.app.input.getGamepad(0);

    this._padBindings.push(
      pad.onTrigger(GamepadButton.South, () => this.player.jump()),
      pad.onActive(GamepadAxis.LeftStickX, v => {
        this.move.x = v;
      }),
      pad.onStop(GamepadAxis.LeftStickX, () => {
        this.move.x = 0;
      }),
    );
  }

  override destroy(): void {
    for (const binding of this._padBindings) {
      binding.unbind();
    }
    this._padBindings.length = 0;
  }
  // #endregion guide:pad-binding-lifetime
}

export { PadScene };
