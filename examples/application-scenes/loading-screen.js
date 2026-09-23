// Auto-generated from loading-screen.ts - edit the .ts source, not this file.
import { Application, Asset, Assets, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Sprite, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const GameAssets = Assets.from({
  ship: 'image/ship-a.png',
  grid: 'image/uv-grid-256.png',
  ramp: 'image/hue-ramp.png',
  click: Asset.type('sound', 'audio/ui-click.ogg'),
});
/**
 * One progress bar for everything the loader is doing, then a hand-over to the
 * game scene. Nothing is awaited in `load()`: the bar is driven by the loader's
 * own signals, which see every `load(...)` call from every scene and system -
 * not just this scene's. Completion is recorded as state and acted on from
 * `update()`, which only runs while this scene is active.
 */
class BootScene extends Scene {
  bar;
  label;
  loaded = 0;
  total = 0;
  failed = false;
  loading = false;
  complete = false;
  leaving = false;
  message = 'Waiting for the first request…';
  onLoadStart;
  onLoadProgress;
  onLoadError;
  onLoadComplete;
  // #region guide:boot-signals
  init() {
    const app = this.app;
    // Per-scene background. `init` runs once per activation, so navigating
    // back here from the play scene repaints the frame in this colour.
    app.clearColor.set(12, 16, 24);
    this.bar = new Graphics();
    this.label = new Text('', { fillColor: Color.white, fontSize: 20, align: 'center' });
    this.label.setAnchor(0.5, 0);
    // Every listener is kept in a field so `unload()` can take it off again.
    this.onLoadStart = key => {
      this.loading = true;
      if (!this.failed) {
        this.message = `Loading ${key}…`;
      }
    };
    this.onLoadProgress = (loaded, total, key) => {
      this.loaded = loaded;
      this.total = total;
      if (!this.failed) {
        this.message = `${loaded} / ${total} — ${key}`;
      }
    };
    this.onLoadError = (key, error) => {
      this.failed = true;
      this.message = `Failed to load "${key}": ${error.message}`;
    };
    this.onLoadComplete = () => {
      this.loading = false;
      if (this.failed) {
        this.message = 'Load failed. Press Space to retry.';
      } else {
        this.complete = true;
      }
    };
    app.loader.onLoadStart.add(this.onLoadStart);
    app.loader.onLoadProgress.add(this.onLoadProgress);
    app.loader.onLoadError.add(this.onLoadError);
    app.loader.onLoadComplete.add(this.onLoadComplete);
    // Trigger loads from anywhere - the signals above see all of them. The
    // claim goes on the application loader so the assets outlive this scene.
    this.inputs.onTrigger(Keyboard.Space, () => {
      if (this.failed && !this.loading) {
        this.loadAssets();
      }
    });
    this.loadAssets();
  }
  // #endregion guide:boot-signals
  loadAssets() {
    this.failed = false;
    this.complete = false;
    this.loading = true;
    this.loaded = 0;
    this.total = 0;
    this.message = 'Loading assets…';
    void this.app.loader.load(GameAssets).catch(error => {
      this.failed = true;
      this.message = `Load failed: ${String(error)}. Press Space to retry.`;
    });
  }
  // #region guide:boot-unsubscribe
  unload() {
    // `this.app` is still valid here - `unload()` runs before the scene is
    // detached, so the listeners can still be removed from the very loader
    // they were added to.
    const app = this.app;
    app.loader.onLoadStart.remove(this.onLoadStart);
    app.loader.onLoadProgress.remove(this.onLoadProgress);
    app.loader.onLoadError.remove(this.onLoadError);
    app.loader.onLoadComplete.remove(this.onLoadComplete);
  }
  update() {
    // A warm cache completes while this scene is still preparing, before it
    // may navigate. Acting on the recorded completion here instead of inside
    // the signal handler covers that case, and never navigates away from a
    // scene that is no longer the active one.
    if (!this.complete || this.leaving) {
      return;
    }
    this.leaving = true;
    void this.app.scenes.change(PlayScene);
  }
  // #endregion guide:boot-unsubscribe
  draw(context) {
    const app = this.app;
    const { width, height } = app;
    const barWidth = width * 0.5;
    const barX = (width - barWidth) / 2;
    const barY = height / 2;
    const ratio = this.total > 0 ? this.loaded / this.total : 0;
    this.bar.clear();
    this.bar.fillColor = new Color(40, 46, 58);
    this.bar.drawRectangle(barX, barY, barWidth, 26);
    this.bar.fillColor = new Color(110, 220, 150);
    this.bar.drawRectangle(barX, barY, barWidth * ratio, 26);
    context.render(this.bar);
    this.label.text = this.message;
    this.label.setPosition(width / 2, barY + 44);
    context.render(this.label);
  }
}
class PlayScene extends Scene {
  ship;
  label;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    app.clearColor.set(16, 26, 22);
    // Already resident: BootScene claimed the catalog on the application
    // loader, so reading the same handles here costs nothing.
    this.ship = new Sprite(GameAssets.ship).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.label = new Text('Loaded — press Space to visit the warm cache.', { fillColor: Color.white, fontSize: 22, align: 'center' });
    this.label.setAnchor(0.5, 0).setPosition(width / 2, height * 0.68);
    this.inputs.onTrigger(Keyboard.Space, () => {
      void app.scenes.change(BootScene);
    });
    this.hud = mountControls({
      title: 'Loading Progress and Retry',
      controls: [{ keys: 'Space', action: 'return to the boot scene' }],
      hint: 'The boot scene follows real loader signals, retries failures, and enters the game after a successful batch.',
    });
  }
  draw(context) {
    context.render(this.ship);
    context.render(this.label);
  }
  destroy() {
    this.hud.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { BootScene, PlayScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});
await app.start(BootScene);
