// Auto-generated from settings-menu.ts - edit the .ts source, not this file.
import {
  Application,
  Button,
  Color,
  Dropdown,
  FixedResolutionCanvasSizing,
  Keyboard,
  Label,
  Panel,
  ProgressBar,
  Scene,
  Slider,
  Spritesheet,
  Stack,
  Toggle,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls, siteUITheme } from '@examples/runtime';
const STORAGE_KEY = 'exojs-playground-settings';
const defaults = { size: 1, motion: true, theme: 'lime' };
const themeColors = {
  lime: new Color(136, 233, 126),
  cyan: new Color(101, 210, 210),
  violet: new Color(186, 126, 255),
};
const loadSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      size: typeof saved.size === 'number' && Number.isFinite(saved.size) ? Math.max(0.5, Math.min(1.5, saved.size)) : defaults.size,
      motion: typeof saved.motion === 'boolean' ? saved.motion : defaults.motion,
      theme: saved.theme === 'cyan' || saved.theme === 'violet' ? saved.theme : defaults.theme,
    };
  } catch {
    return { ...defaults };
  }
};
class SettingsMenuScene extends Scene {
  settings = loadSettings();
  preview;
  size;
  motion;
  theme;
  panel;
  hud;
  meter;
  caption;
  sheetData;
  angle = 0;
  score = 0;
  health = 1;
  scoreButton;
  damageButton;
  async load() {
    await this.loader.load(assets.platformerCharactersImage);
    this.sheetData = await this.loader.load(assets.platformerCharactersAtlas);
  }
  init() {
    this.ui.theme = siteUITheme();
    this.preview = new Spritesheet(this.loader.get(assets.platformerCharactersImage), this.sheetData).getFrameSprite(
      'character_purple_front',
    );
    this.preview.setAnchor(0.5);
    this.addChild(this.preview);
    this.caption = mountControls({
      theme: 'site',
      title: 'UI Controls and Focus',
      hint: 'Tab / D-pad: focus. Arrows adjust. Animate on means motion is enabled.',
    });
    this.panel = new Panel({ width: 252, height: 194, color: new Color(25, 31, 36), cornerRadius: 8 });
    const stack = new Stack({ direction: 'column', spacing: 5, padding: 12 });
    stack.addItem(new Label('Preview size', { fontSize: 14, fillColor: Color.white }));
    this.size = new Slider({ width: 224, height: 32, min: 0.5, max: 1.5, step: 0.1, value: this.settings.size });
    stack.addItem(this.size);
    this.motion = new Toggle({ label: 'Animate preview', height: 32, checked: this.settings.motion, textStyle: { fontSize: 14 } });
    stack.addItem(this.motion);
    this.theme = new Dropdown({
      width: 224,
      height: 32,
      textStyle: { fontSize: 14 },
      items: [
        { label: 'Lime', value: 'lime' },
        { label: 'Cyan', value: 'cyan' },
        { label: 'Violet', value: 'violet' },
      ],
      selectedIndex: ['lime', 'cyan', 'violet'].indexOf(this.settings.theme),
    });
    stack.addItem(this.theme);
    const reset = new Button({ label: 'Reset settings', width: 224, height: 32, fontSize: 14 });
    stack.addItem(reset);
    this.panel.addChild(stack);
    this.ui.addChild(this.panel);
    this.hud = new Label('Score: 0', { fontSize: 14, fillColor: Color.white });
    this.meter = new ProgressBar({ width: 120, height: 12, value: 1 });
    this.ui.addChild(this.hud, this.meter);
    this.scoreButton = new Button({ label: '+10 score', width: 120, height: 32, fontSize: 14 });
    this.damageButton = new Button({ label: 'Take damage', width: 120, height: 32, fontSize: 14 });
    this.scoreButton.onClick.add(() => {
      this.score += 10;
      this.hud.text = `Score: ${this.score}`;
    });
    this.damageButton.onClick.add(() => {
      this.health = Math.max(0, this.health - 0.2);
      this.meter.value = this.health;
    });
    this.ui.addChild(this.scoreButton, this.damageButton);
    this.inputs.onTrigger(Keyboard.Tab);
    this.size.onChange.add(value => {
      this.settings.size = value;
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
      this.size.value = defaults.size;
      this.motion.checked = defaults.motion;
      this.theme.selectedIndex = 0;
      this.settings = { ...defaults };
      this.angle = 0;
      this.score = 0;
      this.health = 1;
      this.hud.text = 'Score: 0';
      this.meter.value = 1;
      this.apply();
    });
    this.apply();
  }
  apply() {
    this.preview.setTint(themeColors[this.settings.theme]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      this.caption.setStatus(`${this.settings.motion ? 'Animating' : 'Motion off'} | size ${this.settings.size.toFixed(1)} | saved`);
    } catch {
      this.caption.setStatus('Storage unavailable; controls still work for this visit.');
    }
  }
  update(delta) {
    if (this.settings.motion) {
      this.angle += delta * 35;
    }
    const { scale: k, width, height, contentHeight, compact } = this.caption.fit(this.app, this.app.canvas);
    const top = height - contentHeight;
    this.ui.uiScale = k;
    this.panel.setPosition(12, top);
    this.hud.setPosition(width - 142, top + 4);
    this.meter.setPosition(width - 142, top + 28);
    this.scoreButton.setPosition(width - 142, top + 48);
    this.damageButton.setPosition(width - 142, top + 86);
    this.preview.setPosition(width * 0.77 * k, (top + (compact ? 158 : contentHeight * 0.57)) * k);
    this.preview.setScale(this.settings.size * (compact ? 0.5 : 1) * k);
    this.preview.setRotation(this.angle);
  }
  destroy() {
    this.caption?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { SettingsMenuScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await app.start(SettingsMenuScene);
