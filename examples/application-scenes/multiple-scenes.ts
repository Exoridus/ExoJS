import {
  Application,
  Color,
  FadeSceneTransition,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  Text,
} from '@codexo/exojs';
import { startExample, unitsPerCssPixel } from '@examples/runtime';

const history: string[] = [];

const record = (event: string): void => {
  history.push(event);

  if (history.length > 8) {
    history.shift();
  }
};

const wipe = new FadeSceneTransition();

class LifecycleScene extends Scene {
  protected sceneName = '';
  private title!: Text;
  private readout!: Text;
  private readonly background = this.track(new Graphics());
  private updates = 0;
  private draws = 0;
  private changing = false;

  override load(): void {
    record(`${this.sceneName}: load`);
  }

  override init(): void {
    record(`${this.sceneName}: init`);
    this.onActivate.add(() => record(`${this.sceneName}: activate`));
    this.title = this.track(new Text(this.sceneName, { fillColor: Color.white, fontWeight: 'bold' }));
    this.readout = this.track(new Text('', { fillColor: new Color(168, 175, 181) }));
    this.background.fillColor = this.sceneName === 'Menu' ? new Color(26, 43, 48) : new Color(22, 58, 48);
    this.background.drawRectangle(0, 0, this.app.width, this.app.height);
    this.background.interactive = true;
    this.background.onPointerTap.add(() => this.change());
    this.inputs.onTrigger(Keyboard.Space, () => this.change());
    this.root.addChild(this.background, this.title, this.readout);
  }

  private change(): void {
    if (this.changing) {
      return;
    }

    this.changing = true;
    void this.app.scenes.change(this.sceneName === 'Menu' ? GameScene : MenuScene, { transition: wipe });
  }

  override update(): void {
    if (this.updates++ === 0) {
      record(`${this.sceneName}: update`);
    }
  }

  override draw(context: RenderingContext): void {
    const k = unitsPerCssPixel(this.app, this.app.canvas as HTMLCanvasElement);
    const width = this.app.width / k;
    const compact = width < 600;
    this.title.style.fontSize = (compact ? 30 : 48) * k;
    this.title.setPosition(24 * k, 50 * k);
    this.readout.style.fontSize = 14 * k;
    this.readout.text = `Update ${this.updates} | draw ${++this.draws}\n${history.join('\n')}`;
    this.readout.setPosition((compact ? width * 0.47 : width * 0.62) * k, 28 * k);
    context.render(this.root);
  }

  override destroy(): void {
    record(`${this.sceneName}: destroy`);
    super.destroy();
  }
}
class MenuScene extends LifecycleScene {
  protected override sceneName = 'Menu';
}
class GameScene extends LifecycleScene {
  protected override sceneName = 'Game';
}

const app = new Application({
  scenes: { MenuScene, GameScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await startExample(app, () => app.start(MenuScene));
