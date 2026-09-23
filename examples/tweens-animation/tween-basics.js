// Auto-generated from tween-basics.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
class InteractiveTweensScene extends Scene {
  sprite;
  target;
  hud;
  moveTween = null;
  roundTrip = false;
  onPointerDown = (_pointer, x, y) => this.moveTo(x, y);
  init() {
    const { width, height } = this.app;
    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.target = new Graphics();
    this.hud = mountControls({
      title: 'Interactive Tweens',
      controls: [
        { keys: 'Click', action: 'move to target; click again to interrupt' },
        { keys: 'Space', action: 'toggle round trip' },
      ],
      hint: 'A new tween starts from the current position. Round trip uses repeat(1) with yoyo().',
    });
    this.updateHud('Ready');
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.roundTrip = !this.roundTrip;
      this.updateHud('Ready');
    });
  }
  moveTo(x, y) {
    this.moveTween?.stop();
    this.target.clear();
    this.target.lineWidth = 2;
    this.target.lineColor = new Color(120, 220, 255);
    this.target.drawCircle(x, y, 24);
    this.moveTween = this.app.tweens
      .create(this.sprite.position)
      .to({ x, y }, 0.7)
      .repeat(this.roundTrip ? 1 : 0)
      .yoyo(this.roundTrip)
      .onComplete(() => this.updateHud('Complete'))
      .start();
    this.updateHud('Moving');
  }
  updateHud(state) {
    this.hud.setStatus(`${state} · ${this.roundTrip ? 'round trip' : 'one way'}`);
  }
  draw(context) {
    context.render(this.target);
    context.render(this.sprite);
  }
  destroy() {
    this.moveTween?.stop();
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.hud.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { InteractiveTweensScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});
await app.start(InteractiveTweensScene);
