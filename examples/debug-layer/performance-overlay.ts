import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Keyboard,
  Scene,
  type Seconds,
  Sprite,
  Texture,
  Time,
} from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

// The HUD counts every frame longer than this budget, paints those rows red,
// and plots the budget as the guide line halfway up the sparkline.
const budgets = [Time.seconds(1 / 60), Time.seconds(1 / 30), Time.seconds(1 / 144)];

class PerformanceOverlayScene extends Scene {
  private sprites!: Array<{ sprite: Sprite; vx: number; vy: number }>;
  private readonly ship = new Texture(assets.ship.source);
  private budgetIndex = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    // All sprites share one texture, so adding them to a single container
    // lets the renderer batch them into a single draw call.
    const layer = new Container();
    this.sprites = Array.from({ length: 1600 }, () => {
      const sprite = new Sprite(this.ship).setAnchor(0.5).setScale(0.25);
      sprite.setPosition(Math.random() * width, Math.random() * height);
      layer.addChild(sprite);

      return {
        sprite,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
      };
    });
    this.root.addChild(layer);
    this.inputs.onTrigger(Keyboard.P, () => {
      debug.layers.performance.visible = !debug.layers.performance.visible;
    });
    this.inputs.onTrigger(Keyboard.B, () => {
      this.budgetIndex = (this.budgetIndex + 1) % budgets.length;
      debug.layers.performance.frameBudget = budgets[this.budgetIndex]!;
    });
    this.inputs.onTrigger(Keyboard.A, () => {
      debug.layers.assetCache.visible = !debug.layers.assetCache.visible;
    });
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;

    for (const item of this.sprites) {
      item.sprite.move(item.vx * delta, item.vy * delta);

      if (item.sprite.position.x < 0 || item.sprite.position.x > width) {
        item.vx *= -1;
      }

      if (item.sprite.position.y < 0 || item.sprite.position.y > height) {
        item.vy *= -1;
      }
    }
  }
}

const app = new Application({
  scenes: { PerformanceOverlayScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

const debug = new DebugOverlay(app);
debug.layers.performance.visible = true;
// Reports what the loader holds: counts per asset type, estimated resident
// bytes, and the heaviest assets. Snapshots on an interval, not per frame.
debug.layers.assetCache.visible = true;

await app.start(PerformanceOverlayScene);
