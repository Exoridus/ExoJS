import { GamepadAxis, GamepadButton, Keyboard, Scene, type Seconds, Sprite } from '@codexo/exojs';

interface Player {
  onGround: boolean;
  velocity: { y: number };
  jump(): void;
  move(dx: number, dy: number): void;
}

class WasdScene extends Scene {
  private sprite = new Sprite();
  private move = { left: 0, right: 0, up: 0, down: 0 };
  private player!: Player;

  // #region guide:wasd-movement
  override init(): void {
    this.move = { left: 0, right: 0, up: 0, down: 0 };

    this.inputs.onActive(Keyboard.A, () => {
      this.move.left = 1;
    });
    this.inputs.onStop(Keyboard.A, () => {
      this.move.left = 0;
    });
    this.inputs.onActive(Keyboard.D, () => {
      this.move.right = 1;
    });
    this.inputs.onStop(Keyboard.D, () => {
      this.move.right = 0;
    });
    this.inputs.onActive(Keyboard.W, () => {
      this.move.up = 1;
    });
    this.inputs.onStop(Keyboard.W, () => {
      this.move.up = 0;
    });
    this.inputs.onActive(Keyboard.S, () => {
      this.move.down = 1;
    });
    this.inputs.onStop(Keyboard.S, () => {
      this.move.down = 0;
    });
  }

  override update(delta: Seconds): void {
    const speed = 280 * delta;
    const dx = (this.move.right - this.move.left) * speed;
    const dy = (this.move.down - this.move.up) * speed;
    this.sprite.move(dx, dy);
  }
  // #endregion guide:wasd-movement

  private bindJump(): void {
    // #region guide:multi-channel-binding
    this.inputs.onTrigger([Keyboard.Space, Keyboard.J], () => {
      this.player.jump();
    });
    // #endregion guide:multi-channel-binding
  }
}

class IntentScene extends Scene {
  private move = { x: 0, y: 0 };
  private actions = { jump: 0, interact: 0, pause: 0 };
  private player!: Player;

  // #region guide:shared-intent
  override init(): void {
    // One source of truth for movement intent
    this.move = { x: 0, y: 0 };
    this.actions = { jump: 0, interact: 0, pause: 0 };

    // Keyboard writes into move / actions
    this.inputs.onActive(Keyboard.A, () => {
      this.move.x = -1;
    });
    this.inputs.onStop(Keyboard.A, () => {
      if (this.move.x === -1) this.move.x = 0;
    });
    this.inputs.onActive(Keyboard.D, () => {
      this.move.x = 1;
    });
    this.inputs.onStop(Keyboard.D, () => {
      if (this.move.x === 1) this.move.x = 0;
    });

    this.inputs.onTrigger(Keyboard.Space, () => {
      this.actions.jump = 1;
    });
    this.inputs.onTrigger(Keyboard.Escape, () => {
      this.actions.pause = 1;
    });

    // Gamepad writes into the same move / actions
    const pad = this.app.input.getGamepad(0);
    pad.onActive(GamepadAxis.LeftStickX, v => {
      this.move.x = v;
    });
    pad.onStop(GamepadAxis.LeftStickX, () => {
      this.move.x = 0;
    });
    pad.onActive(GamepadAxis.LeftStickY, v => {
      this.move.y = v;
    });
    pad.onStop(GamepadAxis.LeftStickY, () => {
      this.move.y = 0;
    });

    pad.onTrigger(GamepadButton.South, () => {
      this.actions.jump = 1;
    });
    pad.onTrigger(GamepadButton.Start, () => {
      this.actions.pause = 1;
    });

    // Consume actions once in update, then reset
  }

  override update(delta: Seconds): void {
    if (this.actions.pause) {
      this.togglePause(); // pauses/resumes via app.scenes + shows/hides the pause overlay on scene.ui
      this.actions.pause = 0;
    }

    if (this.actions.jump && this.player.onGround) {
      this.player.velocity.y = -400;
    }
    this.actions.jump = 0;

    this.player.move(this.move.x * 260 * delta, this.move.y * 260 * delta);
  }
  // #endregion guide:shared-intent

  private togglePause(): void {
    this.app.scenes.pause();
  }
}

export { IntentScene, WasdScene };
