// Auto-generated from multiple-scenes.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  GamepadButton,
  Graphics,
  Keyboard,
  PhasedSceneTransition,
  Scene,
  Text,
} from '@codexo/exojs';
import { demoPanel, startExample } from '@examples/runtime';
const history = [];
const record = event => {
  history.push(event);
  if (history.length > 8) {
    history.shift();
  }
};
class BarWipeTransition extends PhasedSceneTransition {
  getPhaseRequirements() {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
  createPhaseState() {
    return [0, 1].map(() => {
      const bar = new Graphics();
      bar.fillColor = new Color(18, 24, 29);
      bar.drawRectangle(0, 0, 1, 1);
      return bar;
    });
  }
  destroyPhaseState(bars) {
    bars.forEach(bar => bar.destroy());
  }
  enter(context, bars) {
    const view = context.rendering.screenView;
    const height = (view.height * (1 - context.presence)) / 2;
    bars[0].setPosition(0, 0).setScale(view.width, height);
    bars[1].setPosition(0, view.height - height).setScale(view.width, height);
    bars.forEach(bar => context.rendering.render(bar, { view }));
  }
  exit(context, bars) {
    this.enter(context, bars);
  }
}
const wipe = new BarWipeTransition();
class LifecycleScene extends Scene {
  sceneName = '';
  title;
  readout;
  panel;
  updates = 0;
  draws = 0;
  changing = false;
  actions = new ActionMap({
    start: new ButtonAction([Keyboard.Enter, Keyboard.Space, GamepadButton.South]),
    back: new ButtonAction([Keyboard.Escape, GamepadButton.East]),
  });
  load() {
    record(`${this.sceneName}: load`);
  }
  init() {
    record(`${this.sceneName}: init`);
    this.onActivate.add(() => record(`${this.sceneName}: activate`));
    this.title = this.track(new Text(this.sceneName, { fillColor: Color.white, fontWeight: 'bold' }));
    this.readout = this.track(new Text('', { fillColor: new Color(168, 175, 181) }));
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      title: 'Scene Changes and Transitions',
      controls: {},
      hint: 'Enter / South: start; Esc / East: back. Each switch closes the bars once.',
      actions: this.sceneName === 'Menu' ? { Start: () => this.change() } : { Back: () => this.change() },
    });
    this.inputs.attach(this.actions);
    this.app.clearColor.set(this.sceneName === 'Menu' ? 26 : 22, this.sceneName === 'Menu' ? 43 : 58, 48);
  }
  change() {
    if (this.changing) {
      return;
    }
    this.changing = true;
    void this.app.scenes.change(this.sceneName === 'Menu' ? GameScene : MenuScene, { transition: wipe });
  }
  update() {
    if (this.updates++ === 0) {
      record(`${this.sceneName}: update`);
    }
    if ((this.sceneName === 'Menu' ? this.actions.start : this.actions.back).pressed) {
      this.change();
    }
  }
  draw(context) {
    const { scale: k, width, compact } = this.panel.fit(this.app, this.app.canvas);
    this.title.style.fontSize = (compact ? 30 : 48) * k;
    this.title.setPosition(24 * k, 50 * k);
    this.readout.style.fontSize = 14 * k;
    this.readout.text = `Update ${this.updates} | draw ${++this.draws}\n${history.join('\n')}`;
    this.readout.setPosition((compact ? width * 0.47 : width * 0.62) * k, 28 * k);
    context.render(this.title);
    context.render(this.readout);
  }
  destroy() {
    record(`${this.sceneName}: destroy`);
    this.panel?.dispose();
    super.destroy();
  }
}
class MenuScene extends LifecycleScene {
  sceneName = 'Menu';
}
class GameScene extends LifecycleScene {
  sceneName = 'Game';
}
const app = new Application({
  scenes: { MenuScene, GameScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await startExample(app, () => app.start(MenuScene));
