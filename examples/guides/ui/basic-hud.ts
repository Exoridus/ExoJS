// #region guide:basic-hud
import { Application, Button, Color, Label, ProgressBar, Scene } from '@codexo/exojs';

class HudScene extends Scene {
  override init(): void {
    const score = new Label('Score: 0', { fontSize: 24 });
    const health = new ProgressBar({ width: 220, height: 16, value: 1 });
    const damage = new Button({ label: 'Take damage', width: 180, height: 44 });

    score.anchorIn(this.ui, 'top-left', 20, 20);
    health.anchorIn(this.ui, 'top-left', 20, 56);
    damage.anchorIn(this.ui, 'bottom-right', -20, -20);
    damage.onClick.add(() => {
      health.value = Math.max(0, health.value - 0.1);
    });
    this.ui.addChild(score, health, damage);
  }
}

const app = new Application({
  scenes: { HudScene },
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: new Color(20, 24, 32),
});

await app.start(HudScene);
// #endregion guide:basic-hud
