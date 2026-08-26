import { ActionMap, ButtonAction, InputScope, Keyboard, Scene, VectorAction } from '@codexo/exojs';

// #region guide:input-scope
class GameplayScene extends Scene {
  controls = new ActionMap({
    jump: new ButtonAction(Keyboard.Space),
    move: new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D }),
  });

  menu = new InputScope(
    new ActionMap({
      close: new ButtonAction(Keyboard.Escape),
      confirm: new ButtonAction(Keyboard.Space),
    }),
  );

  override init(): void {
    this.inputs.attach(this.controls);
  }

  openMenu(): void {
    this.inputs.pushScope(this.menu);
  }

  closeMenu(): void {
    this.inputs.popScope(this.menu);
  }
}
// #endregion guide:input-scope

export { GameplayScene };
