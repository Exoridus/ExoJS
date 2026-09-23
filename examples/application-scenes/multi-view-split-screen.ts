import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  Text,
  Texture,
  View,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

class SplitScreenScene extends Scene {
  private texture!: Texture;
  private leftView!: View;
  private rightView!: View;
  private divider!: Graphics;
  private grid!: Graphics;
  private labels!: Text[];
  private leftPlayer!: Sprite;
  private rightPlayer!: Sprite;
  private move = {
    a: 0,
    d: 0,
    w: 0,
    s: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  };
  private padMove = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.texture = this.loader.get('image/ship-a.png');

    this.leftView = new View(0, 0, width / 2, height).setViewport(0, 0, 0.5, 1);
    this.rightView = new View(0, 0, width / 2, height).setViewport(0.5, 0, 0.5, 1);

    this.divider = new Graphics();
    this.divider.fillColor = Color.white;
    this.divider.drawRectangle(width / 2 - 1, 0, 2, height);
    this.grid = new Graphics();
    this.grid.lineWidth = 2;
    this.grid.lineColor = new Color(42, 70, 96);
    for (let x = -1600; x <= 1600; x += 160) this.grid.drawLine(x, -1200, x, 1200);
    for (let y = -1200; y <= 1200; y += 160) this.grid.drawLine(-1600, y, 1600, y);
    this.labels = [
      new Text('P1 · WASD / Pad 1', { fillColor: new Color(120, 190, 255), fontSize: 24 }).setPosition(24, 160),
      new Text('P2 · Arrows / Pad 2', { fillColor: new Color(255, 180, 120), fontSize: 24 }).setPosition(width / 2 + 24, 160),
    ];
    mountControls({ title: 'Local Split Screen', hint: 'Move each player to see its camera follow independently. Controllers are optional.' });

    this.leftPlayer = new Sprite(this.texture)
      .setAnchor(0.5)
      .setPosition(-160, 0)
      .setTint(new Color(120, 190, 255));
    this.rightPlayer = new Sprite(this.texture)
      .setAnchor(0.5)
      .setPosition(160, 0)
      .setTint(new Color(255, 180, 120));

    this.inputs.onActive(Keyboard.A, () => {
      this.move.a = 1;
    });
    this.inputs.onStop(Keyboard.A, () => {
      this.move.a = 0;
    });
    this.inputs.onActive(Keyboard.D, () => {
      this.move.d = 1;
    });
    this.inputs.onStop(Keyboard.D, () => {
      this.move.d = 0;
    });
    this.inputs.onActive(Keyboard.W, () => {
      this.move.w = 1;
    });
    this.inputs.onStop(Keyboard.W, () => {
      this.move.w = 0;
    });
    this.inputs.onActive(Keyboard.S, () => {
      this.move.s = 1;
    });
    this.inputs.onStop(Keyboard.S, () => {
      this.move.s = 0;
    });
    this.inputs.onActive(Keyboard.Left, () => {
      this.move.left = 1;
    });
    this.inputs.onStop(Keyboard.Left, () => {
      this.move.left = 0;
    });
    this.inputs.onActive(Keyboard.Right, () => {
      this.move.right = 1;
    });
    this.inputs.onStop(Keyboard.Right, () => {
      this.move.right = 0;
    });
    this.inputs.onActive(Keyboard.Up, () => {
      this.move.up = 1;
    });
    this.inputs.onStop(Keyboard.Up, () => {
      this.move.up = 0;
    });
    this.inputs.onActive(Keyboard.Down, () => {
      this.move.down = 1;
    });
    this.inputs.onStop(Keyboard.Down, () => {
      this.move.down = 0;
    });
    for (let index = 0; index < 2; index++) {
      const pad = app.input.gamepads[index];
      const movement = this.padMove[index];
      pad.onActive(GamepadAxis.LeftStickX, value => {
        movement.x = value;
      });
      pad.onStop(GamepadAxis.LeftStickX, () => {
        movement.x = 0;
      });
      pad.onActive(GamepadAxis.LeftStickY, value => {
        movement.y = value;
      });
      pad.onStop(GamepadAxis.LeftStickY, () => {
        movement.y = 0;
      });
    }
  }

  override update(delta: Seconds): void {
    const speed = 300 * delta;

    this.leftPlayer.move((this.move.d - this.move.a + this.padMove[0].x) * speed, (this.move.s - this.move.w + this.padMove[0].y) * speed);
    this.rightPlayer.move((this.move.right - this.move.left + this.padMove[1].x) * speed, (this.move.down - this.move.up + this.padMove[1].y) * speed);
    this.leftView.setCenter(this.leftPlayer.position.x, this.leftPlayer.position.y);
    this.rightView.setCenter(this.rightPlayer.position.x, this.rightPlayer.position.y);
  }

  override draw(context: RenderingContext): void {
    context.render(this.grid, { view: this.leftView });
    context.render(this.leftPlayer, { view: this.leftView });
    context.render(this.rightPlayer, { view: this.leftView });
    context.render(this.grid, { view: this.rightView });
    context.render(this.leftPlayer, { view: this.rightView });
    context.render(this.rightPlayer, { view: this.rightView });
    context.render(this.divider, { view: context.screenView });
    for (const label of this.labels) context.render(label, { view: context.screenView });
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
  loader: {
    basePath: 'assets/',
  },
});

await app.start(SplitScreenScene);
