import {
  Application,
  Button,
  Color,
  Dropdown,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Label,
  Panel,
  type RenderingContext,
  Scene,
  type Seconds,
  Slider,
  Stack,
  Toggle,
} from '@codexo/exojs';

type Theme = 'blue' | 'amber' | 'violet';
interface Settings {
  volume: number;
  motion: boolean;
  theme: Theme;
}

const STORAGE_KEY = 'exojs-playground-settings';
const defaults: Settings = { volume: 0.7, motion: true, theme: 'blue' };
const themeColors: Record<Theme, Color> = {
  blue: new Color(92, 170, 255),
  amber: new Color(255, 180, 92),
  violet: new Color(186, 126, 255),
};

const loadSettings = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : defaults.volume,
      motion: typeof saved.motion === 'boolean' ? saved.motion : defaults.motion,
      theme: saved.theme === 'amber' || saved.theme === 'violet' ? saved.theme : defaults.theme,
    };
  } catch {
    return { ...defaults };
  }
};

class SettingsMenuScene extends Scene {
  private settings = loadSettings();
  private preview!: Graphics;
  private volume!: Slider;
  private motion!: Toggle;
  private theme!: Dropdown<Theme>;
  private status!: Label;
  private angle = 0;

  override init(): void {
    const { width, height } = this.app;
    this.preview = new Graphics().setPosition(width * 0.79, height / 2);
    this.addChild(this.preview);

    const panel = new Panel({ width: 420, height: 460, color: new Color(28, 38, 56), cornerRadius: 20 });
    const stack = new Stack({ direction: 'column', spacing: 14, padding: 24 });
    stack.addItem(new Label('Settings', { fontSize: 34, fillColor: Color.white }));
    stack.addItem(new Label('Master volume', { fontSize: 21, fillColor: Color.white }));
    this.volume = new Slider({ width: 320, min: 0, max: 1, step: 0.05, value: this.settings.volume });
    stack.addItem(this.volume);
    this.motion = new Toggle({ label: 'Animate preview', checked: this.settings.motion });
    stack.addItem(this.motion);
    stack.addItem(new Label('Accent colour', { fontSize: 21, fillColor: Color.white }));
    this.theme = new Dropdown<Theme>({
      width: 320,
      items: [
        { label: 'Blue', value: 'blue' },
        { label: 'Amber', value: 'amber' },
        { label: 'Violet', value: 'violet' },
      ],
      selectedIndex: ['blue', 'amber', 'violet'].indexOf(this.settings.theme),
    });
    stack.addItem(this.theme);
    const reset = new Button({ label: 'Reset settings', width: 320, height: 48 });
    stack.addItem(reset);
    this.status = new Label('Tab or D-pad to focus; arrows adjust controls.', { fontSize: 16, fillColor: new Color(180, 205, 230) });
    stack.addItem(this.status);
    panel.addChild(stack);
    panel.anchorIn(this.ui, 'center');
    this.ui.addChild(panel);

    // Capture browser defaults so Tab stays in the canvas and Space activates the focused widget.
    this.inputs.onTrigger(Keyboard.Tab, () => {
      this.status.text = 'Tab moves focus between controls.';
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.status.text = 'Space activates the focused control.';
    });

    this.volume.onChange.add(value => {
      this.settings.volume = value;
      this.apply();
    });
    this.motion.onChange.add(value => {
      this.settings.motion = value;
      this.apply();
    });
    this.theme.onChange.add(value => {
      this.settings.theme = value;
      this.apply();
    });
    reset.onClick.add(() => {
      this.volume.value = defaults.volume;
      this.motion.checked = defaults.motion;
      this.theme.selectedIndex = 0;
      this.settings = { ...defaults };
      this.apply();
    });
    this.apply();
  }

  private apply(): void {
    this.app.audio.master.volume = this.settings.volume;
    this.preview.clear();
    this.preview.fillColor = themeColors[this.settings.theme];
    this.preview.drawRectangle(-62, -62, 124, 124);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      this.status.text = 'Saved in this browser. Tab or D-pad to focus.';
    } catch {
      this.status.text = 'Storage unavailable. Settings work for this visit.';
    }
  }

  override update(delta: Seconds): void {
    if (this.settings.motion) {
      this.angle += delta * 45;
    }
    this.preview.setRotation(this.angle);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { SettingsMenuScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(14, 20, 32),
});

await app.start(SettingsMenuScene);
