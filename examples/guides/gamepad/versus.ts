import { ActionMap, ButtonAction, GamepadAxis, GamepadButton, Scene, VectorAction } from '@codexo/exojs';

// #region guide:two-players
const createPlayerActions = () => ({
  jump: new ButtonAction(GamepadButton.South),
  move: new VectorAction({ x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY }),
});

class VersusScene extends Scene {
  override init(): void {
    const p1 = new ActionMap(createPlayerActions(), { gamepad: this.inputs.getGamepad(0) });
    const p2 = new ActionMap(createPlayerActions(), { gamepad: this.inputs.getGamepad(1) });

    this.inputs.attach(p1);
    this.inputs.attach(p2);
  }
}
// #endregion guide:two-players

export { VersusScene };
