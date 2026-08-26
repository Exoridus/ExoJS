import { Application, BlurFilter, Color, Keyboard, Label, Panel, type RenderingContext, Scene, SceneAvailability, type Seconds, Sprite } from '@codexo/exojs';

// #region guide:pause-scene
class GameScene extends Scene {
  private player!: Sprite;
  private blur!: BlurFilter;
  private pausePanel!: Panel;
  private pauseLabel!: Label;

  override init(): void {
    // Background - the engine clears to this before every `draw`.
    this.app.clearColor.set(20, 24, 34);

    this.player = new Sprite(this.loader.get('image/hero.png'));
    this.addChild(this.player);
    // ... game setup ...

    this.blur = new BlurFilter({ radius: 0, quality: 2 });

    // Pause overlay on the UI layer, hidden until paused.
    this.pausePanel = new Panel({ width: 420, height: 140, cornerRadius: 18, color: new Color(0, 0, 0, 0.6) });
    this.pausePanel.anchorIn(this.ui, 'center');
    this.pausePanel.visible = false;
    this.ui.addChild(this.pausePanel);

    this.pauseLabel = new Label('PAUSED', { fontSize: 56, fontWeight: 'bold' });
    this.pauseLabel.anchorIn(this.ui, 'center');
    this.pauseLabel.visible = false;
    this.ui.addChild(this.pauseLabel);

    // `SceneAvailability.Always` keeps this binding live in both Active and Paused -
    // otherwise a 'active'-only binding (the default) would stop firing
    // the moment the scene pauses, and Escape could never resume it.
    this.inputs.onTrigger(Keyboard.Escape, () => this.togglePause(), { when: SceneAvailability.Always });
  }

  override update(_delta: Seconds): void {
    // Not called while paused - the director skips update() + systems.
    // ... normal game logic ...
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  override destroy(): void {
    this.root.clearFilters();
    super.destroy();
  }

  private togglePause(): void {
    const pausing = !this.paused;

    if (pausing) {
      this.app.scenes.pause();
    } else {
      this.app.scenes.resume();
    }

    this.pausePanel.visible = pausing;
    this.pauseLabel.visible = pausing;

    if (pausing) {
      this.blur.radius = 0;
      this.root.filters = [this.blur];
      this.app.tweens.create(this.blur).to({ radius: 6 }, 0.35).start();
    } else {
      this.root.clearFilters();
    }
  }
}

const app = new Application({ scenes: { GameScene } /* , ...other options */ });

await app.start(GameScene);
// #endregion guide:pause-scene
