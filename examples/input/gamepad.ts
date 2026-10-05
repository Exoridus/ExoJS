import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  type Gamepad,
  GamepadAxis,
  GamepadButton,
  Graphics,
  type RenderingContext,
  Scene,
  Text,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const AXES = [
  { name: 'Left X', channel: GamepadAxis.LeftStickX },
  { name: 'Left Y', channel: GamepadAxis.LeftStickY },
  { name: 'Right X', channel: GamepadAxis.RightStickX },
  { name: 'Right Y', channel: GamepadAxis.RightStickY },
];

const BUTTONS = [
  { name: 'South', channel: GamepadButton.South },
  { name: 'East', channel: GamepadButton.East },
  { name: 'West', channel: GamepadButton.West },
  { name: 'North', channel: GamepadButton.North },
  { name: 'Left shoulder', channel: GamepadButton.LeftShoulder },
  { name: 'Right shoulder', channel: GamepadButton.RightShoulder },
  { name: 'Left trigger', channel: GamepadButton.LeftTrigger },
  { name: 'Right trigger', channel: GamepadButton.RightTrigger },
  { name: 'Start', channel: GamepadButton.Start },
  { name: 'Select', channel: GamepadButton.Select },
];

class GamepadScene extends Scene {
  private pad!: Gamepad;
  private axes: { name: string; binding: ReturnType<Gamepad['onActive']> }[] = [];
  private buttons: { name: string; binding: ReturnType<Gamepad['onActive']> }[] = [];
  private status!: Text;
  private axisText!: Text;
  private buttonText!: Text;
  private graphics = new Graphics();
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    this.pad = this.app.input.getGamepad(0);
    this.axes = AXES.map(({ name, channel }) => ({ name, binding: this.pad.onActive(channel) }));
    this.buttons = BUTTONS.map(({ name, channel }) => ({ name, binding: this.pad.onActive(channel) }));
    this.status = new Text('', { fillColor: Color.white, fontSize: 23 }).setPosition(260, 130);
    this.axisText = new Text('', { fillColor: new Color(125, 215, 255), fontSize: 23 }).setPosition(270, 450);
    this.buttonText = new Text('', { fillColor: new Color(255, 195, 125), fontSize: 21 }).setPosition(800, 240);
    this.hud = mountControls({
      title: 'Controller Inspector',
      status: 'Slot 1 is waiting for a controller.',
      hint: 'Axes and button values update live; disconnected state stays visible.',
    });
  }

  override update(): void {
    this.status.text = this.pad.connected
      ? `Slot 1: ${this.pad.info?.label ?? 'Connected controller'}`
      : 'No controller connected. Attach one and press a button.';
    this.axisText.text = this.axes.map(axis => `${axis.name}: ${axis.binding.value.toFixed(2)}`).join('\n');
    this.buttonText.text = this.buttons.map(button => `${button.name}: ${button.binding.value.toFixed(2)}`).join('\n');
  }

  override draw(context: RenderingContext): void {
    this.graphics.clear();
    this.graphics.fillColor = new Color(44, 53, 67);
    this.graphics.drawCircle(390, 310, 100);
    this.graphics.drawCircle(650, 310, 100);
    this.graphics.fillColor = new Color(100, 205, 245);
    this.graphics.drawCircle(390 + this.axes[0]!.binding.value * 75, 310 + this.axes[1]!.binding.value * 75, 22);
    this.graphics.drawCircle(650 + this.axes[2]!.binding.value * 75, 310 + this.axes[3]!.binding.value * 75, 22);
    context.render(this.graphics);
    context.render(this.status);
    context.render(this.axisText);
    context.render(this.buttonText);
  }

  override destroy(): void {
    for (const entry of [...this.axes, ...this.buttons]) {
      entry.binding.unbind();
    }
    this.hud?.dispose();
    this.status?.destroy();
    this.axisText?.destroy();
    this.buttonText?.destroy();
    this.graphics.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { GamepadScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(12, 18, 28),
});

await app.start(GamepadScene);
