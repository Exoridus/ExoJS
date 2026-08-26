import { ActionMap, AxisAction, ButtonAction, GamepadAxis, GamepadButton, Keyboard, PointerButton, Scene, type Vector, VectorAction } from '@codexo/exojs';

// #region guide:action-map
class GameScene extends Scene {
  // Your own game object - anything exposing these three methods.
  declare player: { jump(): void; steer(amount: number): void; move(direction: Vector): void };

  controls = new ActionMap({
    jump: new ButtonAction([Keyboard.Space, GamepadButton.South]),
    attack: new ButtonAction([PointerButton.Primary, GamepadButton.West]),
    steer: new AxisAction([GamepadAxis.LeftStickX, { negative: Keyboard.A, positive: Keyboard.D }]),
    move: new VectorAction([
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
      { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
    ]),
  });

  override init(): void {
    this.inputs.attach(this.controls);
  }

  override update(): void {
    if (this.controls.jump.pressed) {
      this.player.jump();
    }

    this.player.steer(this.controls.steer.value);
    this.player.move(this.controls.move.value);
  }
}
// #endregion guide:action-map

export { GameScene };
