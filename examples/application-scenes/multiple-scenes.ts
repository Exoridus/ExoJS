import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FadeSceneTransition,
  FixedResolutionCanvasSizing,
  GamepadButton,
  Keyboard,
  type RenderingContext,
  Scene,
  Text,
} from '@codexo/exojs';
import { demoPanel, startExample } from '@examples/runtime';

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
  private panel!: ReturnType<typeof demoPanel>;
  private updates = 0;
  private draws = 0;
  private changing = false;
  private readonly actions = new ActionMap({
    start: new ButtonAction([Keyboard.Enter, Keyboard.Space, GamepadButton.South]),
    back: new ButtonAction([Keyboard.Escape, GamepadButton.East]),
  });

  override load(): void {
    record(`${this.sceneName}: load`);
  }

  override init(): void {
    record(`${this.sceneName}: init`);
    this.onActivate.add(() => record(`${this.sceneName}: activate`));
    this.title = this.track(new Text(this.sceneName, { fillColor: Color.white, fontWeight: 'bold' }));
    this.readout = this.track(new Text('', { fillColor: new Color(168, 175, 181) }));
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
      actions: this.sceneName === 'Menu' ? { Start: () => this.change() } : { Back: () => this.change() },
    });
    this.inputs.attach(this.actions);
    this.app.clearColor.set(this.sceneName === 'Menu' ? 26 : 22, this.sceneName === 'Menu' ? 43 : 58, 48);
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

    if ((this.sceneName === 'Menu' ? this.actions.start : this.actions.back).pressed) {
      this.change();
    }
  }

  override draw(context: RenderingContext): void {
    const { scale: k, width, compact } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.title.style.fontSize = (compact ? 30 : 48) * k;
    this.title.setPosition(24 * k, 50 * k);
    this.readout.style.fontSize = 14 * k;
    this.readout.text = `Update ${this.updates} | draw ${++this.draws}\n${history.join('\n')}`;
    this.readout.setPosition((compact ? width * 0.47 : width * 0.62) * k, 28 * k);
    context.render(this.title);
    context.render(this.readout);
  }

  override destroy(): void {
    record(`${this.sceneName}: destroy`);
    this.panel?.dispose();
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
