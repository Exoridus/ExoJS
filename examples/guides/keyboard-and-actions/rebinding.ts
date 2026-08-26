import { type InputBinding, Keyboard, Scene, type Seconds } from '@codexo/exojs';

class RebindScene extends Scene {
  private jumpChannel: Keyboard = Keyboard.Space;
  private rebindRequested = false;
  private jumpDirty = true;
  private jumpVelocity = 0;
  private _jumpBinding: InputBinding | null = null;

  // #region guide:runtime-rebinding
  override init(): void {
    this.jumpChannel = Keyboard.Space;
    this.rebindRequested = false;
    this.jumpDirty = true;

    // The rebind trigger - press J to enter rebind mode
    this.inputs.onTrigger(Keyboard.J, () => {
      this.rebindRequested = true;
    });

    // Capture the next keydown as the new jump binding
    this.app.input.onKeyDown.add(channel => {
      if (!this.rebindRequested) return;
      this.jumpChannel = channel;
      this.rebindRequested = false;
      this.jumpDirty = true;
    });

    this._rebindJump();
  }

  _rebindJump(): void {
    if (!this.jumpDirty) return;
    this._jumpBinding?.unbind();
    this._jumpBinding = this.inputs.onTrigger(this.jumpChannel, () => {
      this.jumpVelocity = -260;
    });
    this.jumpDirty = false;
  }

  override update(delta: Seconds): void {
    this._rebindJump();
    // ... apply jumpVelocity ...
  }
  // #endregion guide:runtime-rebinding
}

export { RebindScene };
