// Auto-generated from custom-transition.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, SceneTransition, Text, Time } from '@codexo/exojs';
/** A full-width bar, drawn once at unit size and scaled into place every frame. */
const createBar = color => {
  const bar = new Graphics();
  bar.fillColor = color;
  bar.drawRectangle(0, 0, 1, 1);
  return bar;
};
class BarWipeSession {
  _halfDuration;
  _environment;
  placement = 'screen';
  _phase = 'closing';
  _elapsed = 0;
  // Two nodes, not one drawn twice: a draw is submitted, not executed, so the
  // second draw of a single reused node would overwrite the first before the
  // frame is flushed.
  _topBar;
  _bottomBar;
  constructor(_halfDuration, color, _environment) {
    this._halfDuration = _halfDuration;
    this._environment = _environment;
    this._topBar = createBar(color);
    this._bottomBar = createBar(color);
  }
  get done() {
    return this._phase === 'done';
  }
  update(delta) {
    if (this._phase === 'done') {
      return;
    }
    // The commit is asynchronous: requesting it does not switch the scene in
    // the same call. Hold the closed bars until the switch is actually
    // observed, or the incoming scene would pop in behind an open screen.
    if (this._phase === 'holding') {
      if (!this._environment.committed) {
        return;
      }
      this._phase = 'opening';
      this._elapsed = 0;
    }
    this._elapsed = Math.min(this._halfDuration, this._elapsed + Math.max(0, delta));
    if (this._elapsed < this._halfDuration) {
      return;
    }
    if (this._phase === 'closing') {
      this._environment.commit();
      this._phase = 'holding';
    } else {
      this._phase = 'done';
    }
  }
  render(context) {
    const bounds = context.screenView.getBounds();
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const barHeight = (height / 2) * this._coverage();
    if (barHeight <= 0) {
      return;
    }
    this._topBar.setPosition(bounds.left, bounds.top).setScale(width, barHeight);
    this._bottomBar.setPosition(bounds.left, bounds.bottom - barHeight).setScale(width, barHeight);
    context.render(this._topBar, { view: context.screenView });
    context.render(this._bottomBar, { view: context.screenView });
  }
  destroy() {
    this._topBar.destroy();
    this._bottomBar.destroy();
  }
  /** How much of each half of the screen the bars cover, 0 (open) to 1 (closed). */
  _coverage() {
    const progress = this._halfDuration > 0 ? Math.min(1, this._elapsed / this._halfDuration) : 1;
    switch (this._phase) {
      case 'closing':
        return progress;
      case 'holding':
        return 1;
      default:
        return 1 - progress;
    }
  }
}
/**
 * Two bars close in from the top and bottom edges, the scene switches behind
 * them, then they open again.
 */
class BarWipeSceneTransition extends SceneTransition {
  _halfDuration;
  _color;
  constructor(halfDuration = Time.seconds(0.3), color = Color.black) {
    super();
    this._halfDuration = halfDuration;
    this._color = color;
  }
  // The bars draw over the live surface, so the scene needs no texture pass and
  // no snapshot of the outgoing scene.
  getRequirements() {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
  createSession(environment) {
    return new BarWipeSession(this._halfDuration, this._color, environment);
  }
}
const wipe = new BarWipeSceneTransition(Time.seconds(0.3), new Color(12, 14, 20, 1));
class WipeScene extends Scene {
  menu = true;
  background = this.track(new Graphics());
  label = this.track(new Text('', { align: 'center', fillColor: Color.white, fontSize: 34, fontWeight: 'bold' }));
  changing = false;
  init() {
    this.background.fillColor = this.menu ? new Color(18, 38, 72) : new Color(24, 72, 42);
    this.background.drawRectangle(0, 0, this.app.width, this.app.height);
    this.background.interactive = true;
    this.background.onPointerTap.add(() => this.change());
    this.inputs.onTrigger(Keyboard.Space, () => this.change());
    this.label.text = this.menu ? 'MENU' : 'GAME';
    this.label.setAnchor(0.5).setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(this.background, this.label);
  }
  change() {
    if (this.changing) {
      return;
    }
    this.changing = true;
    void this.app.scenes.change(this.menu ? GameScene : MenuScene, { transition: wipe });
  }
  draw(context) {
    context.render(this.root);
  }
}
class MenuScene extends WipeScene {}
class GameScene extends WipeScene {
  menu = false;
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
});
await app.start(MenuScene, { transition: wipe });
