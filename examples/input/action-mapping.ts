import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  GamepadButton,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  VectorAction,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const PULSE_COLOR = new Color(255, 190, 90);

class ActionMappingScene extends Scene {
  private sprite!: Sprite;
  private readonly actions = new ActionMap({
    move: new VectorAction([
      { up: [Keyboard.W, Keyboard.Up], down: [Keyboard.S, Keyboard.Down], left: [Keyboard.A, Keyboard.Left], right: [Keyboard.D, Keyboard.Right] },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
    pulse: new ButtonAction([Keyboard.Space, GamepadButton.South]),
  });
  private pulseRemaining = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const { width, height } = this.app;

    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.inputs.attach(this.actions);
    this.hud = mountControls({
      title: 'Input Actions',
      controls: [
        { keys: 'WASD / Arrows / Left stick', action: 'move' },
        { keys: 'Space / South button', action: 'pulse' },
      ],
      status: '',
      hint: 'Keyboard and controller feed the same move and pulse actions.',
    });
  }

  override update(delta: Seconds): void {
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

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }

  override destroy(): void {
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
  loader: {
    basePath: 'assets/',
  },
});

await app.start(ActionMappingScene);
