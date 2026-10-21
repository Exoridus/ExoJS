// Auto-generated from action-mapping.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  GamepadButton,
  Keyboard,
  Scene,
  Sprite,
  VectorAction,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';
const PULSE_COLOR = new Color(255, 190, 90);
class ActionMappingScene extends Scene {
  sprite;
  actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
    pulse: new ButtonAction([Keyboard.Space, GamepadButton.South]),
  });
  pulseRemaining = 0;
  hud;
  init() {
    const { width, height } = this.app;
    this.sprite = new Sprite(this.loader.get(assets.ship)).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.inputs.attach(this.actions);
    this.hud = mountControls();
  }
  update(delta) {
    const { x, y } = this.actions.move.value;
    const { width, height } = this.app;
    this.sprite.setPosition(
      Math.max(24, Math.min(width - 24, this.sprite.x + x * 260 * delta)),
      Math.max(24, Math.min(height - 24, this.sprite.y + y * 260 * delta)),
    );
    if (this.actions.pulse.pressed) {
      this.pulseRemaining = 0.35;
    }
    this.pulseRemaining = Math.max(0, this.pulseRemaining - delta);
    this.sprite.setTint(this.pulseRemaining > 0 ? PULSE_COLOR : Color.white);
    this.hud.setStatus(`Move ${x.toFixed(2)}, ${y.toFixed(2)} · Pulse ${this.pulseRemaining > 0 ? 'active' : 'ready'}`);
  }
  draw(context) {
    context.render(this.sprite);
  }
  destroy() {
    this.hud.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ActionMappingScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});
await app.start(ActionMappingScene);
