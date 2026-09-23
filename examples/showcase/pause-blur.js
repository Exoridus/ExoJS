// Auto-generated from pause-blur.ts - edit the .ts source, not this file.
import { Application, BlurFilter, Color, FixedResolutionCanvasSizing, Keyboard, Label, Panel, Scene, SceneAvailability, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const PAUSE_BLUR_STRENGTH = 3;
const PAUSE_FADE_SECONDS = 0.35;
class GameScene extends Scene {
  sprite;
  time = 0;
  blur = new BlurFilter({ strength: 0 });
  blurTween = null;
  pausePanel;
  pauseLabel;
  hud;
  onPointerDown = () => this.togglePause();
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprite = new Sprite(this.loader.get('image/ship-a.png'))
      .setAnchor(0.5)
      .setScale(2)
      .setPosition(width * 0.72, height / 2);
    this.addChild(this.sprite);
    // Pause overlay on the UI layer, hidden until paused.
    this.pausePanel = new Panel({ width: 420, height: 140, cornerRadius: 18, color: new Color(0, 0, 0, 0.6) });
    this.pausePanel.anchorIn(this.ui, 'center');
    this.pausePanel.visible = false;
    this.ui.addChild(this.pausePanel);
    this.pauseLabel = new Label('PAUSED', { fontSize: 56, fontWeight: 'bold' });
    this.pauseLabel.anchorIn(this.ui, 'center');
    this.pauseLabel.visible = false;
    this.ui.addChild(this.pauseLabel);
    this.hud = mountControls({
      title: 'Pause Menu',
      controls: [{ keys: 'Esc / Click', action: 'pause / resume' }],
      status: 'Running',
      hint: 'Scene updates stop while paused; the application tween still fades in the blur.',
    });
    this.inputs.onTrigger(Keyboard.Escape, () => this.togglePause(), { when: SceneAvailability.Always });
    app.input.onPointerDown.add(this.onPointerDown);
  }
  update(delta) {
    this.time += delta;
    this.sprite.setRotation(this.time * 80);
  }
  draw(context) {
    context.render(this.root);
  }
  destroy() {
    this.blurTween?.stop();
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.hud.dispose();
    this.root.clearFilters();
    super.destroy();
  }
  togglePause() {
    const pausing = !this.paused;
    this.blurTween?.stop();
    if (pausing) {
      this.app.scenes.pause();
    } else {
      this.app.scenes.resume();
    }
    this.pausePanel.visible = pausing;
    this.pauseLabel.visible = pausing;
    this.hud.setStatus(pausing ? 'Paused' : 'Running');
    if (pausing) {
      this.blur.strength = 0;
      this.root.filters = [this.blur];
      this.blurTween = this.app.tweens.create(this.blur).to({ strength: PAUSE_BLUR_STRENGTH }, PAUSE_FADE_SECONDS).start();
    } else {
      this.root.clearFilters();
      this.blurTween = null;
    }
  }
}
const app = new Application({
  scenes: { GameScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(20, 24, 34),
  loader: {
    basePath: 'assets/',
  },
});
void app.start(GameScene);
