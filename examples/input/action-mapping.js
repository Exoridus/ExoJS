// Auto-generated from action-mapping.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  BindingProfile,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  GamepadButton,
  inputToken,
  Keyboard,
  Scene,
  Sprite,
  Spritesheet,
  Text,
  VectorAction,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel } from '@examples/runtime';
const STORAGE_KEY = 'exo-example-action-mapping';
class ActionMappingScene extends Scene {
  sprite;
  actions = new ActionMap({
    move: new VectorAction(
      [
        {
          up: [Keyboard.W, Keyboard.Up],
          down: [Keyboard.S, Keyboard.Down],
          left: [Keyboard.A, Keyboard.Left],
          right: [Keyboard.D, Keyboard.Right],
        },
        { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
      ],
      { threshold: 0.15 },
    ),
    pulse: new ButtonAction([Keyboard.Space, GamepadButton.South]),
  });
  profile = new BindingProfile();
  pulseRemaining = 0;
  pulseCount = 0;
  rebinding = false;
  message = 'Ready';
  device = 'Keyboard';
  keyboardPrompts;
  padPrompts;
  characters;
  glyph;
  bindingLabel = new Text('', { fillColor: Color.white, fontSize: 18 });
  processedX;
  processedY;
  panel;
  onKeyDown = channel => {
    this.device = 'Keyboard';
    if (!this.rebinding) {
      return;
    }
    if (channel === Keyboard.Escape) {
      this.cancel();
      return;
    }
    const token = inputToken(channel);
    if (!token?.startsWith('keyboard.')) {
      return;
    }
    const previous = this.actions.pulse.channels;
    this.actions.rebind('pulse', [channel, GamepadButton.South]);
    if (this.actions.conflicts().some(conflict => conflict.actions.includes('pulse'))) {
      this.actions.rebind('pulse', previous);
      this.message = 'Conflict: movement key. Choose another key or Cancel.';
      return;
    }
    this.profile.set('pulse', this.actions.pulse.serialize());
    this.message = 'Binding saved';
    this.save();
    this.rebinding = false;
  };
  onPad = () => {
    this.device = 'Gamepad';
  };
  async load() {
    this.characters = new Spritesheet(
      await this.loader.load(assets.platformerCharactersImage),
      await this.loader.load(assets.platformerCharactersAtlas),
    );
    this.keyboardPrompts = new Spritesheet(
      await this.loader.load(assets.keyboardMouseInputPromptsImage),
      await this.loader.load(assets.keyboardMouseInputPromptsAtlas),
    );
    this.padPrompts = new Spritesheet(
      await this.loader.load(assets.genericInputPromptsImage),
      await this.loader.load(assets.genericInputPromptsAtlas),
    );
  }
  init() {
    // Kenney input-prompt descriptors use bottom-origin rows; Sprite frames use top-origin rows.
    for (const sheet of [this.keyboardPrompts, this.padPrompts]) {
      for (const frame of sheet.frames.values()) {
        frame.y = sheet.texture.height - frame.y - frame.height;
      }
    }
    this.sprite = new Sprite(this.characters.texture)
      .setTextureFrame(this.characters.frames.get('character_green_idle'))
      .setAnchor(0.5)
      .setPosition(this.app.width / 2, this.app.height / 2);
    this.glyph = new Sprite(this.keyboardPrompts.texture).setAnchor(0.5);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.profile = BindingProfile.fromJSON(JSON.parse(raw));
        this.actions.applyProfile(this.profile);
      }
      if (this.actions.conflicts().length) {
        throw new Error('Conflicting profile');
      }
    } catch {
      this.profile.clear();
      this.actions.applyProfile(null);
      this.message = 'Invalid or unavailable saved profile; defaults restored';
    }
    this.inputs.attach(this.actions);
    this.processedX = this.inputs.onActive(GamepadAxis.LeftStickX);
    this.processedY = this.inputs.onActive(GamepadAxis.LeftStickY);
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Input actions & rebinding',
      controls: {},
      hint: 'WASD / arrows / stick move. Pulse uses Space / South. Stick radial deadzone 0.20; action threshold 0.15.',
      actions: {
        'Rebind pulse': () => {
          this.rebinding = true;
          this.message = 'Press a key; Escape cancels';
          this.app.canvas.focus();
        },
        Cancel: () => this.cancel(),
        Reset: () => {
          this.cancel();
          this.actions.applyProfile(null);
          this.profile.clear();
          this.save();
          this.message = 'Defaults restored';
          this.sprite.setPosition(this.app.width / 2, this.app.height / 2);
          this.pulseCount = 0;
          this.app.canvas.focus();
        },
      },
    });
    this.app.input.onKeyDown.add(this.onKeyDown);
    this.app.input.onAnyGamepadButtonDown.add(this.onPad);
  }
  cancel() {
    this.rebinding = false;
    this.message = 'Rebinding cancelled';
  }
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      this.message = 'Binding works this session; storage unavailable';
    }
  }
  update(delta) {
    const fit = this.panel.fit(this.app, this.app.canvas);
    const pad = this.app.input.gamepads[0];
    const raw = pad.browserGamepad?.axes;
    const rawX = raw?.[pad.mapping?.axes.find(axis => axis.channel === GamepadAxis.LeftStickX)?.index ?? 0] ?? 0;
    const rawY = raw?.[pad.mapping?.axes.find(axis => axis.channel === GamepadAxis.LeftStickY)?.index ?? 1] ?? 0;
    if (Math.hypot(rawX, rawY) > 0.2) {
      this.device = 'Gamepad';
    }
    if (!pad.connected) {
      this.device = 'Keyboard';
    }
    const { x, y } = this.actions.move.value;
    const distance = !this.rebinding && this.actions.move.active ? 260 * delta : 0;
    this.sprite.setPosition(
      Math.max(40 * fit.scale, Math.min(this.app.width - 40 * fit.scale, this.sprite.x + x * distance)),
      Math.max(40 * fit.scale, Math.min(Math.max(40, fit.contentHeight - 110) * fit.scale, this.sprite.y + y * distance)),
    );
    if (!this.rebinding && this.actions.pulse.pressed) {
      this.pulseRemaining = 0.35;
      this.pulseCount++;
    }
    this.pulseRemaining = Math.max(0, this.pulseRemaining - delta);
    this.sprite.setScale(0.7 * fit.scale).setTint(this.pulseRemaining > 0 ? new Color(151, 226, 60) : Color.white);
    const token = inputToken(this.actions.pulse.channels[0]);
    const key = token?.replace('keyboard.', '') ?? 'space';
    const sheet = this.device === 'Gamepad' ? this.padPrompts : this.keyboardPrompts;
    const frame =
      sheet.frames.get(this.device === 'Gamepad' ? 'generic_button_circle' : `keyboard_${key.replaceAll('-', '_')}`) ??
      this.keyboardPrompts.frames.get('keyboard_space');
    this.glyph
      .setTexture(sheet.texture)
      .setTextureFrame(frame)
      .setPosition(this.app.width / 2 - 100 * fit.scale, (fit.contentHeight - 35) * fit.scale)
      .setScale(0.65 * fit.scale);
    this.bindingLabel.text = `Pulse: ${this.device === 'Gamepad' ? (pad.getLabel('ButtonSouth') ?? 'South') : key.toUpperCase()} | ${this.pulseCount}`;
    this.bindingLabel.setScale(fit.scale).setPosition(this.app.width / 2 - 65 * fit.scale, (fit.contentHeight - 42) * fit.scale);
    this.panel.status(
      `${this.message} | ${this.device}${pad.connected ? '' : ' (pad absent)'} | Raw ${rawX.toFixed(2)},${rawY.toFixed(2)} > Deadzone ${this.processedX.value.toFixed(2)},${this.processedY.value.toFixed(2)} > Action ${x.toFixed(2)},${y.toFixed(2)} ${this.actions.move.active ? 'active' : 'neutral'}`,
    );
  }
  draw(context) {
    context.render(this.sprite);
    context.render(this.glyph);
    context.render(this.bindingLabel);
  }
  destroy() {
    this.app.input.onKeyDown.remove(this.onKeyDown);
    this.app.input.onAnyGamepadButtonDown.remove(this.onPad);
    this.panel.dispose();
    this.sprite.destroy();
    this.glyph.destroy();
    this.bindingLabel.destroy();
    this.characters.destroy();
    this.keyboardPrompts.destroy();
    this.padPrompts.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ActionMappingScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 28, 37),
});
await app.start(ActionMappingScene);
