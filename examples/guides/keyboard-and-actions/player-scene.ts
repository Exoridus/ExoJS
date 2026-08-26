import { GamepadAxis, GamepadButton, Keyboard, type RenderingContext, Scene, type Seconds, Sprite } from '@codexo/exojs';

// #region guide:two-device-scene
class PlayerScene extends Scene {
  private sprite!: Sprite;
  private keys!: { left: number; right: number; up: number; down: number };
  private stick!: { x: number; y: number };
  private jumpImpulse!: number;

  override async load(): Promise<void> {
    await this.loader.load('image/hero.png');
  }

  override init(): void {
    this.sprite = new Sprite(this.loader.get('image/hero.png')).setAnchor(0.5).setPosition(400, 300);

    // Keyboard state
    this.keys = { left: 0, right: 0, up: 0, down: 0 };

    // Gamepad state
    this.stick = { x: 0, y: 0 };

    // Jump impulse - either device
    this.jumpImpulse = 0;

    // --- Keyboard bindings (auto-disposed on scene unload) ---
    this.inputs.onActive(Keyboard.A, () => {
      this.keys.left = 1;
    });
    this.inputs.onStop(Keyboard.A, () => {
      this.keys.left = 0;
    });
    this.inputs.onActive(Keyboard.D, () => {
      this.keys.right = 1;
    });
    this.inputs.onStop(Keyboard.D, () => {
      this.keys.right = 0;
    });
    this.inputs.onActive(Keyboard.W, () => {
      this.keys.up = 1;
    });
    this.inputs.onStop(Keyboard.W, () => {
      this.keys.up = 0;
    });
    this.inputs.onActive(Keyboard.S, () => {
      this.keys.down = 1;
    });
    this.inputs.onStop(Keyboard.S, () => {
      this.keys.down = 0;
    });

    this.inputs.onTrigger(Keyboard.Space, () => {
      this.jumpImpulse = -220;
    });

    // --- Gamepad bindings (per-slot, must be unbound manually if slot changes) ---
    const pad0 = this.app.input.getGamepad(0);

    pad0.onTrigger(GamepadButton.South, () => {
      this.jumpImpulse = -220;
    });

    pad0.onActive(GamepadAxis.LeftStickX, value => {
      this.stick.x = value;
    });
    pad0.onStop(GamepadAxis.LeftStickX, () => {
      this.stick.x = 0;
    });

    pad0.onActive(GamepadAxis.LeftStickY, value => {
      this.stick.y = value;
    });
    pad0.onStop(GamepadAxis.LeftStickY, () => {
      this.stick.y = 0;
    });
  }

  override update(delta: Seconds): void {
    // Best input wins: prefer the device with the larger magnitude
    const keyX = this.keys.right - this.keys.left;
    const keyY = this.keys.down - this.keys.up;

    const moveX = Math.abs(this.stick.x) > Math.abs(keyX) ? this.stick.x : keyX;
    const moveY = Math.abs(this.stick.y) > Math.abs(keyY) ? this.stick.y : keyY;

    this.sprite.move(moveX * 260 * delta, moveY * 260 * delta);

    // Jump physics (same impulse source for both devices)
    this.sprite.move(0, this.jumpImpulse * delta);
    this.jumpImpulse = Math.min(0, this.jumpImpulse + 800 * delta);
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}
// #endregion guide:two-device-scene

export { PlayerScene };
