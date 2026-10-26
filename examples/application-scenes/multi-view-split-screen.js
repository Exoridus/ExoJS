// Auto-generated from multi-view-split-screen.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  clamp,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  Scene,
  Sprite,
  Spritesheet,
  Text,
  VectorAction,
  View,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';
class SplitScreenScene extends Scene {
  characters;
  panel;
  leftView;
  rightView;
  divider;
  dividerScale = 0;
  grid;
  labels;
  leftPlayer;
  rightPlayer;
  leftControls;
  rightControls;
  async load() {
    this.characters = new Spritesheet(
      await this.loader.load(assets.platformerCharactersImage),
      await this.loader.load(assets.platformerCharactersAtlas),
    );
  }
  init() {
    const app = this.app;
    const { width, height } = app;
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
    this.leftPlayer = new Sprite(this.characters.texture)
      .setTextureFrame(this.characters.frames.get('character_green_idle'))
      .setAnchor(0.5)
      .setPosition(-160, 0)
      .setTint(new Color(120, 190, 255));
    this.rightPlayer = new Sprite(this.characters.texture)
      .setTextureFrame(this.characters.frames.get('character_purple_idle'))
      .setAnchor(0.5)
      .setPosition(160, 0)
      .setTint(new Color(255, 180, 120));
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
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
    });
  }
  update(delta) {
    const fit = this.panel.fit(this.app, this.app.canvas);
    if (this.dividerScale !== fit.scale) {
      this.dividerScale = fit.scale;
      this.divider.clear();
      this.divider.fillColor = Color.white;
      this.divider.drawRectangle(this.app.width / 2 - fit.scale, 0, 2 * fit.scale, this.app.height);
    }
    this.panel.status(
      `P1 WASD / Pad 1 ${this.app.input.gamepads[0].connected ? 'connected' : 'absent'} | P2 arrows / Pad 2 ${this.app.input.gamepads[1].connected ? 'connected' : 'absent'}`,
    );
    this.labels.forEach((label, i) => {
      label.setScale(fit.scale);
      label.setPosition((i * this.app.width) / 2 + 12 * fit.scale, 12 * fit.scale);
      label.text = `P${i + 1}`;
    });
    const speed = 300 * delta;
    const left = this.leftControls.move.value;
    const right = this.rightControls.move.value;
    this.leftPlayer.move(left.x * speed, left.y * speed);
    this.rightPlayer.move(right.x * speed, right.y * speed);
    for (const player of [this.leftPlayer, this.rightPlayer]) {
      player.setPosition(clamp(player.x, -1500, 1500), clamp(player.y, -1100, 1100));
    }
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
  destroy() {
    this.panel.dispose();
    this.leftView.destroy();
    this.rightView.destroy();
    this.grid.destroy();
    this.divider.destroy();
    this.leftPlayer.destroy();
    this.rightPlayer.destroy();
    for (const label of this.labels) {
      label.destroy();
    }
    this.characters.destroy();
    super.destroy();
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
  clearColor: new Color(24, 35, 46),
});
await startExample(app, () => app.start(SplitScreenScene));
