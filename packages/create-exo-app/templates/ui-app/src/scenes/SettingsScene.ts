import type { RenderingContext } from '@codexo/exojs';
import { Button, Checkbox, Color, Dropdown, Label, Panel, Scene, Slider, Stack, TextInput } from '@codexo/exojs';

type Difficulty = 'casual' | 'normal' | 'brutal';

interface Settings {
  playerName: string;
  volume: number;
  difficulty: Difficulty;
  fullscreen: boolean;
}

/**
 * A settings screen built from the UI widgets in core.
 *
 * Widgets live on `scene.ui`, a screen-fixed layer the engine renders above the
 * world without being asked to - `draw` below only renders `this.root`. They
 * anchor to the screen edges rather than to absolute positions, so the layout
 * survives a resize.
 *
 * The pattern worth copying is the split between the widgets and the state they
 * edit: nothing reads a value back out of a widget. Each control writes into
 * `_draft` on change, `Apply` copies the draft into `_applied`, and the summary
 * panel renders from `_applied` alone.
 */
export class SettingsScene extends Scene {
  private readonly _draft: Settings = { playerName: 'Player One', volume: 0.7, difficulty: 'normal', fullscreen: false };
  private _applied: Settings = { ...this._draft };
  private _summary!: Label;
  private _status!: Label;

  public override init(): void {
    this.ui.addChild(this._buildForm());
    this.ui.addChild(this._buildSummary());

    this._refreshSummary();
  }

  public override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  private _buildForm(): Panel {
    const name = new TextInput({ width: 300, placeholder: 'Your name', value: this._draft.playerName, maxLength: 24 });
    name.onChange.add(value => {
      this._draft.playerName = value;
    });

    const volume = new Slider({ width: 300, min: 0, max: 1, value: this._draft.volume, step: 0.05 });
    const volumeLabel = new Label(this._volumeText(this._draft.volume), { fontSize: 16 });
    volume.onChange.add(value => {
      this._draft.volume = value;
      volumeLabel.text = this._volumeText(value);
    });

    const difficulty = new Dropdown<Difficulty>({
      width: 300,
      items: [
        { label: 'Casual', value: 'casual' },
        { label: 'Normal', value: 'normal' },
        { label: 'Brutal', value: 'brutal' },
      ],
      selectedIndex: 1,
    });
    difficulty.onChange.add(value => {
      this._draft.difficulty = value;
    });

    const fullscreen = new Checkbox({ label: 'Start in fullscreen', checked: this._draft.fullscreen });
    fullscreen.onChange.add(checked => {
      this._draft.fullscreen = checked;
    });

    const apply = new Button({ label: 'Apply', color: new Color(54, 120, 220), width: 140, height: 42 });
    apply.onClick.add(() => {
      this._applied = { ...this._draft };
      this._refreshSummary();
      this._status.text = 'Applied.';
    });

    const revert = new Button({ label: 'Revert', color: new Color(90, 96, 110), width: 140, height: 42 });
    revert.onClick.add(() => {
      Object.assign(this._draft, this._applied);
      name.value = this._applied.playerName;
      volume.value = this._applied.volume;
      volumeLabel.text = this._volumeText(this._applied.volume);
      fullscreen.checked = this._applied.fullscreen;
      this._status.text = 'Reverted to the applied settings.';
    });

    const actions = new Stack({ direction: 'row', spacing: 12 });
    actions.addItem(apply);
    actions.addItem(revert);

    this._status = new Label('Change something, then Apply.', { fontSize: 15 });

    const form = new Stack({ direction: 'column', spacing: 14, padding: 24 });
    form.addItem(new Label('Settings', { fontSize: 30 }));
    form.addItem(new Label('Player name', { fontSize: 16 }));
    form.addItem(name);
    form.addItem(volumeLabel);
    form.addItem(volume);
    form.addItem(new Label('Difficulty', { fontSize: 16 }));
    form.addItem(difficulty);
    form.addItem(fullscreen);
    form.addItem(actions);
    form.addItem(this._status);

    const panel = new Panel({ borderColor: new Color(255, 255, 255, 0.16), borderWidth: 1, cornerRadius: 12 });
    panel.setSize(form.uiWidth, form.uiHeight);
    panel.addChild(form);
    panel.anchorIn(this.ui, 'top-left', 48, 48);

    return panel;
  }

  private _buildSummary(): Panel {
    this._summary = new Label('', { fontSize: 18 });

    const stack = new Stack({ direction: 'column', spacing: 12, padding: 24 });
    stack.addItem(new Label('In effect', { fontSize: 22 }));
    stack.addItem(this._summary);

    const panel = new Panel({ borderColor: new Color(255, 255, 255, 0.16), borderWidth: 1, cornerRadius: 12 });
    panel.setSize(360, 200);
    panel.addChild(stack);
    panel.anchorIn(this.ui, 'top-right', -48, 48);

    return panel;
  }

  private _refreshSummary(): void {
    const { playerName, volume, difficulty, fullscreen } = this._applied;

    this._summary.text = [`Name: ${playerName}`, this._volumeText(volume), `Difficulty: ${difficulty}`, `Fullscreen: ${fullscreen ? 'on' : 'off'}`].join('\n');
  }

  private _volumeText(value: number): string {
    return `Volume: ${Math.round(value * 100)}%`;
  }
}
