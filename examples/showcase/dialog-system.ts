import {
  ActionMap,
  Application,
  Button,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  GamepadButton,
  Keyboard,
  Panel,
  type RenderingContext,
  Scene,
  type Seconds,
  type Sprite,
  Spritesheet,
  type SpritesheetData,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls, siteUITheme, startExample } from '@examples/runtime';

const lines = ['Welcome, explorer. The bridge is washed out.', 'We can repair it together, or take the forest trail.'];
const choices = ['Repair the bridge', 'Take the forest trail'];
const endings = [
  'You help Mira repair the bridge. The village opens a safe crossing for everyone.',
  'Mira joins you on the forest trail. Together you discover a hidden garden.',
];

class DialogSystemScene extends Scene {
  private namePlate!: Text;
  private box!: Text;
  private portrait!: Sprite;
  private backdrop!: Panel;
  private continueButton!: Button;
  private replyButtons: Button[] = [];
  private caption!: ReturnType<typeof mountControls>;
  private sheetData!: SpritesheetData;
  private readonly actions = new ActionMap({ advance: new ButtonAction([Keyboard.Space, GamepadButton.South]) });
  private lineIndex = 0;
  private chars = 0;
  private timer = 0;
  private awaitingChoice = false;
  private ending: number | null = null;
  private pendingAdvance = false;
  private pendingChoice: number | null = null;

  override async load(): Promise<void> {
    await this.loader.load(assets.platformerCharactersImage);
    this.sheetData = await this.loader.load(assets.platformerCharactersAtlas);
  }

  override init(): void {
    this.ui.theme = siteUITheme();
    this.portrait = this.track(
      new Spritesheet(this.loader.get(assets.platformerCharactersImage), this.sheetData).getFrameSprite('character_beige_front'),
    );
    this.portrait.setAnchor(0.5);
    this.namePlate = this.track(new Text('Mira', { fillColor: new Color(136, 233, 126), fontWeight: 'bold' }));
    this.box = this.track(new Text('', { fillColor: Color.white, lineHeight: 1.35 }));
    this.backdrop = this.track(new Panel({ color: new Color(25, 31, 36), cornerRadius: 8 }));
    this.caption = mountControls({
      theme: 'site',
      title: 'Dialogue and Choices',
      hint: 'Continue: click / Space / South. Tab or D-pad chooses a reply. Silent by default.',
    });
    this.continueButton = new Button({ label: 'Continue', width: 144, height: 36, fontSize: 14 });
    this.continueButton.onClick.add(() => {
      this.pendingAdvance = true;
    });
    this.ui.addChild(this.continueButton);
    this.replyButtons = choices.map((reply, index) => {
      const button = new Button({ label: reply, width: 180, height: 36, fontSize: 14 });
      button.onClick.add(() => {
        this.pendingChoice = index;
      });
      this.ui.addChild(button);

      return button;
    });
    this.inputs.attach(this.actions);
    this.inputs.onTrigger(Keyboard.Tab);
    this.showChoices(false);
  }

  private get text(): string {
    return this.ending === null ? lines[this.lineIndex]! : endings[this.ending]!;
  }

  private showChoices(visible: boolean): void {
    this.awaitingChoice = visible;
    this.replyButtons.forEach(button => {
      button.visible = visible;
    });
    this.continueButton.visible = !visible;

    if (visible) {
      this.replyButtons[0]!.focus();
    }
  }

  private startLine(): void {
    this.chars = 0;
    this.timer = 0;
  }

  private advance(): void {
    if (this.awaitingChoice) {
      return;
    }

    if (this.chars < this.text.length) {
      this.chars = this.text.length;

      return;
    }

    if (this.ending !== null) {
      this.ending = null;
      this.lineIndex = 0;
      this.continueButton.label = 'Continue';
      this.caption.setStatus('New conversation.');
      this.startLine();
    } else if (this.lineIndex < lines.length - 1) {
      this.lineIndex++;
      this.startLine();
    } else {
      this.showChoices(true);
    }
  }

  override update(delta: Seconds): void {
    // UI activation and the South/Space action can share one input frame; coalesce them before advancing.
    if (this.pendingChoice !== null) {
      this.ending = this.pendingChoice;
      this.pendingChoice = null;
      this.pendingAdvance = false;
      this.startLine();
      this.showChoices(false);
      this.continueButton.label = 'Restart';
      this.caption.setStatus(`Choice: ${choices[this.ending]}`);
    } else if (this.pendingAdvance || this.actions.advance.pressed) {
      this.pendingAdvance = false;
      this.advance();
    }

    if (!this.awaitingChoice) {
      this.timer += delta;

      while (this.timer >= 0.035 && this.chars < this.text.length) {
        this.timer -= 0.035;
        this.chars++;
      }
    }

    this.box.text = this.text.slice(0, this.chars);
  }

  override draw(context: RenderingContext): void {
    const { scale: k, width, height, contentHeight, compact } = this.caption.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const top = height - contentHeight;
    const textX = compact ? 112 : width * 0.28;
    this.ui.uiScale = k;
    this.backdrop
      .setScale(k)
      .setPosition((textX - 12) * k, top * k)
      .setSize(width - textX, Math.max(80, contentHeight - 58));
    this.portrait.setPosition((compact ? 52 : width * 0.15) * k, (top + (contentHeight - 48) / 2) * k).setScale((compact ? 0.65 : 1.4) * k);
    this.namePlate.style.fontSize = 16 * k;
    this.namePlate.setPosition(textX * k, (top + 8) * k);
    this.box.style.fontSize = 16 * k;
    const maxWidth = (width - textX - 24) * k;

    if (this.box.layout.maxWidth !== maxWidth) {
      this.box.layout = { maxWidth };
    }

    this.box.setPosition(textX * k, (top + 36) * k);
    this.continueButton.setPosition(width - 164, height - 48);
    this.replyButtons.forEach((button, index) => button.setPosition(width - 388 + index * 192, height - 48));
    context.render(this.backdrop);
    context.render(this.portrait);
    context.render(this.namePlate);
    context.render(this.box);
  }

  override destroy(): void {
    this.caption?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { DialogSystemScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(DialogSystemScene));
