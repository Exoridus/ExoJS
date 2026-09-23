import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, type RenderingContext, Scene, Text } from '@codexo/exojs';

const history: string[] = [];
const record = (event: string): void => {
  history.push(event);
  if (history.length > 8) {
    history.shift();
  }
};

const makeReadout = (width: number): Text =>
  new Text('', { fillColor: Color.white, fontSize: 19, align: 'center' }).setAnchor(0.5, 0).setPosition(width / 2, 390);

const makeBackground = (width: number, height: number, color: Color): Graphics => {
  const background = new Graphics();
  background.fillColor = color;
  background.drawRectangle(0, 0, width, height);
  return background;
};

class MenuScene extends Scene {
  private background!: Graphics;
  private title!: Text;
  private readout!: Text;
  private updates = 0;
  private draws = 0;

  override async load(): Promise<void> {
    record('Menu: load');
  }

  override init(): void {
    record('Menu: init');
    this.onActivate.add(() => record('Menu: activate'));
    this.background = makeBackground(this.app.width, this.app.height, new Color(18, 38, 72));
    this.title = new Text('MENU\nSpace: start game', { align: 'center', fillColor: Color.white, fontSize: 36, fontWeight: 'bold' });
    this.title.setAnchor(0.5).setPosition(this.app.width / 2, 220);
    this.readout = makeReadout(this.app.width);
    this.inputs.onTrigger(Keyboard.Space, () => void this.app.scenes.change(GameScene));
  }

  override update(): void {
    this.updates++;
  }

  override draw(context: RenderingContext): void {
    this.draws++;
    this.readout.text = `Menu update ${this.updates} · draw ${this.draws}\n${history.join('\n')}`;
    context.render(this.background);
    context.render(this.title);
    context.render(this.readout);
  }

  override destroy(): void {
    record('Menu: destroy');
    super.destroy();
  }
}

class GameScene extends Scene {
  private background!: Graphics;
  private title!: Text;
  private readout!: Text;
  private updates = 0;
  private draws = 0;

  override async load(): Promise<void> {
    record('Game: load');
  }

  override init(): void {
    record('Game: init');
    this.onActivate.add(() => record('Game: activate'));
    this.background = makeBackground(this.app.width, this.app.height, new Color(24, 72, 42));
    this.title = new Text('GAME\nEsc: return to menu', { align: 'center', fillColor: Color.white, fontSize: 36, fontWeight: 'bold' });
    this.title.setAnchor(0.5).setPosition(this.app.width / 2, 220);
    this.readout = makeReadout(this.app.width);
    this.inputs.onTrigger(Keyboard.Escape, () => void this.app.scenes.change(MenuScene));
  }

  override update(): void {
    this.updates++;
  }

  override draw(context: RenderingContext): void {
    this.draws++;
    this.readout.text = `Game update ${this.updates} · draw ${this.draws}\n${history.join('\n')}`;
    context.render(this.background);
    context.render(this.title);
    context.render(this.readout);
  }

  override destroy(): void {
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
