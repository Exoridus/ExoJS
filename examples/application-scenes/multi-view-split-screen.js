// Auto-generated from multi-view-split-screen.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  Scene,
  Sprite,
  Text,
  VectorAction,
  View,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
class SplitScreenScene extends Scene {
  texture;
  leftView;
  rightView;
  divider;
  grid;
  labels;
  leftPlayer;
  rightPlayer;
  leftControls;
  rightControls;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.texture = this.loader.get(assets.ship);
    this.leftView = new View(0, 0, width / 2, height).setViewport(0, 0, 0.5, 1);
    this.rightView = new View(0, 0, width / 2, height).setViewport(0.5, 0, 0.5, 1);
    this.divider = new Graphics();
    this.divider.fillColor = Color.white;
    this.divider.drawRectangle(width / 2 - 1, 0, 2, height);
    this.grid = new Graphics();
    this.grid.lineWidth = 2;
    this.grid.lineColor = new Color(42, 70, 96);
    for (let x = -1600; x <= 1600; x += 160) {
      this.grid.drawLine(x, -1200, x, 1200);
    }
    for (let y = -1200; y <= 1200; y += 160) {
      this.grid.drawLine(-1600, y, 1600, y);
    }
    this.labels = [
      new Text('P1 · WASD / Pad 1', { fillColor: new Color(120, 190, 255), fontSize: 24 }).setPosition(24, 160),
      new Text('P2 · Arrows / Pad 2', { fillColor: new Color(255, 180, 120), fontSize: 24 }).setPosition(width / 2 + 24, 160),
    ];
    this.leftPlayer = new Sprite(this.texture)
      .setAnchor(0.5)
      .setPosition(-160, 0)
      .setTint(new Color(120, 190, 255));
    this.rightPlayer = new Sprite(this.texture)
      .setAnchor(0.5)
      .setPosition(160, 0)
      .setTint(new Color(255, 180, 120));
    // One map per player: each binds its own keys and reads its own pad slot.
    this.leftControls = new ActionMap(
      {
        move: new VectorAction([
          { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
          { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
        ]),
      },
      { gamepad: app.input.gamepads[0] },
    );
    this.rightControls = new ActionMap(
      {
        move: new VectorAction([
          { up: Keyboard.Up, down: Keyboard.Down, left: Keyboard.Left, right: Keyboard.Right },
          { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
        ]),
      },
      { gamepad: app.input.gamepads[1] },
    );
    this.inputs.attach(this.leftControls);
    this.inputs.attach(this.rightControls);
  }
  update(delta) {
    const speed = 300 * delta;
    const left = this.leftControls.move.value;
    const right = this.rightControls.move.value;
    this.leftPlayer.move(left.x * speed, left.y * speed);
    this.rightPlayer.move(right.x * speed, right.y * speed);
    this.leftView.setCenter(this.leftPlayer.position.x, this.leftPlayer.position.y);
    this.rightView.setCenter(this.rightPlayer.position.x, this.rightPlayer.position.y);
  }
  draw(context) {
    context.render(this.grid, { view: this.leftView });
    context.render(this.leftPlayer, { view: this.leftView });
    context.render(this.rightPlayer, { view: this.leftView });
    context.render(this.grid, { view: this.rightView });
    context.render(this.leftPlayer, { view: this.rightView });
    context.render(this.rightPlayer, { view: this.rightView });
    context.render(this.divider, { view: context.screenView });
    for (const label of this.labels) {
      context.render(label, { view: context.screenView });
    }
  }
}
const app = new Application({
  scenes: { SplitScreenScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(SplitScreenScene);
