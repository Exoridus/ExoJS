import { Application, Button, Color, FixedResolutionCanvasSizing, Label, ProgressBar, Scene, Stack } from '@codexo/exojs';
import { unitsPerCssPixel } from '@examples/runtime';

class HudScene extends Scene {
  private score = 0;
  private health = 1;
  private scoreLabel!: Label;
  private healthBar!: ProgressBar;
  private buttons!: Stack;
  private readonly commands: Button[] = [];

  override init(): void {
    this.scoreLabel = new Label('Score: 0', { fontSize: 18, fontWeight: '600' });
    this.healthBar = new ProgressBar({ width: 180, height: 10, value: 1 });
    this.buttons = new Stack({ direction: 'row', spacing: 8 });
    this.addCommand('+10 score', () => {
      this.score += 10;
      this.scoreLabel.text = `Score: ${this.score}`;
    });
    this.addCommand('Take damage', () => {
      this.health = Math.max(0, this.health - 0.2);
      this.healthBar.value = this.health;
    });
    this.ui.addChild(this.scoreLabel, this.healthBar, this.buttons);
  }

  private addCommand(label: string, onClick: () => void): void {
    const button = new Button({ label, width: 144, height: 40, fontSize: 14 });
    button.onClick.add(onClick);
    this.commands.push(button);
    this.buttons.addItem(button);
  }

  override update(): void {
    const k = unitsPerCssPixel(this.app, this.app.canvas as HTMLCanvasElement);
    const width = this.app.width / k;
    const height = this.app.height / k;
    const buttonWidth = Math.min(144, (width - 40) / this.commands.length);
    this.ui.uiScale = k;
    this.scoreLabel.setPosition(16, 14);
    this.healthBar.setPosition(16, 44);

    for (const button of this.commands) {
      if (button.uiWidth !== buttonWidth) {
        button.setSize(buttonWidth, 40);
      }
    }

    this.buttons.setPosition(16, height - 56);
  }
}

const app = new Application({
  scenes: { HudScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 18, 24),
});

await app.start(HudScene);
