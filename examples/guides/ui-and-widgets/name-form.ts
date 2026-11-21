// #region guide:name-form
import { Application, Button, Color, GamepadButton, Label, Scene, Stack, TextInput } from '@codexo/exojs';

class NameFormScene extends Scene {
  override init(): void {
    const menu = new Stack({ direction: 'column', spacing: 12, padding: 20 });
    const field = new TextInput({ width: 280, placeholder: 'Player name', maxLength: 24 });
    const save = new Button({ label: 'Save name', width: 280 });
    const status = new Label('Enter a name, then save.');

    const submit = (): void => {
      const name = field.value.trim();

      status.text = name ? `Saved: ${name}` : 'Enter a name first.';
    };

    field.onSubmit.add(submit);
    save.onClick.add(submit);
    menu.addItem(field).addItem(save).addItem(status);
    menu.anchorIn(this.ui, 'center');
    this.ui.addChild(menu);

    // D-pad navigation is built in; this one form opts into South as Confirm.
    // It shares the same validation as pointer/keyboard activation and text submit.
    this.inputs.onStart(GamepadButton.South, () => {
      if (save.focused && save.effectiveEnabled) {
        submit();
      }
    });
    this.onActivate.add(() => field.focus());
  }
}

const app = new Application({
  scenes: { NameFormScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(NameFormScene);
// #endregion guide:name-form
