// Auto-generated from multiple-scenes.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Text } from '@codexo/exojs';
const history = [];
const record = event => {
  history.push(event);
  if (history.length > 8) {
    history.shift();
  }
};
const makeReadout = width => new Text('', { fillColor: Color.white, fontSize: 19, align: 'center' }).setAnchor(0.5, 0).setPosition(width / 2, 390);
const makeBackground = (width, height, color) => {
  const background = new Graphics();
  background.fillColor = color;
  background.drawRectangle(0, 0, width, height);
  return background;
};
class MenuScene extends Scene {
  background;
  title;
  readout;
  updates = 0;
  draws = 0;
  async load() {
    record('Menu: load');
  }
  init() {
    record('Menu: init');
    this.onActivate.add(() => record('Menu: activate'));
    this.background = makeBackground(this.app.width, this.app.height, new Color(18, 38, 72));
    this.title = new Text('MENU\nSpace: start game', { align: 'center', fillColor: Color.white, fontSize: 36, fontWeight: 'bold' });
    this.title.setAnchor(0.5).setPosition(this.app.width / 2, 220);
    this.readout = makeReadout(this.app.width);
    this.inputs.onTrigger(Keyboard.Space, () => void this.app.scenes.change(GameScene));
  }
  update() {
    this.updates++;
  }
  draw(context) {
    this.draws++;
    this.readout.text = `Menu update ${this.updates} · draw ${this.draws}\n${history.join('\n')}`;
    context.render(this.background);
    context.render(this.title);
    context.render(this.readout);
  }
  destroy() {
    record('Menu: destroy');
    super.destroy();
  }
}
class GameScene extends Scene {
  background;
  title;
  readout;
  updates = 0;
  draws = 0;
  async load() {
    record('Game: load');
  }
  init() {
    record('Game: init');
    this.onActivate.add(() => record('Game: activate'));
    this.background = makeBackground(this.app.width, this.app.height, new Color(24, 72, 42));
    this.title = new Text('GAME\nEsc: return to menu', { align: 'center', fillColor: Color.white, fontSize: 36, fontWeight: 'bold' });
    this.title.setAnchor(0.5).setPosition(this.app.width / 2, 220);
    this.readout = makeReadout(this.app.width);
    this.inputs.onTrigger(Keyboard.Escape, () => void this.app.scenes.change(MenuScene));
  }
  update() {
    this.updates++;
  }
  draw(context) {
    this.draws++;
    this.readout.text = `Game update ${this.updates} · draw ${this.draws}\n${history.join('\n')}`;
    context.render(this.background);
    context.render(this.title);
    context.render(this.readout);
  }
  destroy() {
    record('Game: destroy');
    super.destroy();
  }
}
const app = new Application({
  scenes: { MenuScene, GameScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});
await app.start(MenuScene);
