import { Keyboard } from '#input/types';
import type { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { PlatformTextInput } from '#platform/PlatformTextInput';
import { TextInput } from '#ui/TextInput';

import { createUIApp, fireBeforeInput, makePointer, press, transportTextarea, type } from '../support/text-field-harness';

describe('TextInput', () => {
  test('a pointer press takes focus and places the caret', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);

    // (5, 18) is left of the content box (inset 8) - the caret starts at 0.
    press(harness, 5, 18);
    expect(harness.im.focused).toBe(field);

    type('hello');
    expect(field.value).toBe('hello');

    // Glyph k spans [10k, 10k + 8] in layout space; screen x = 8 (inset) + 13
    // lands in the left half of glyph 1.
    press(harness, 21, 18);
    expect(field.selectionStart).toBe(1);

    // Far right of the text: the caret sits after the last glyph.
    press(harness, 103, 18);
    expect(field.selectionStart).toBe(5);
  });

  test('a press-drag extends a selection from the anchor', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('hello');

    harness.signals.onPointerMove.dispatch(makePointer(53, 18), 53, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);

    harness.signals.onPointerUp.dispatch(makePointer(53, 18), 53, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);
  });

  test('a double press selects the word under the pointer', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab cd');
    press(harness, 5, 18);

    press(harness, 6, 18);

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(2);
  });

  test('editing keys are consumed, so focus navigation does not also react', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });
    const other = new TextInput({ width: 100, height: 36 });

    harness.scene.ui.addChild(field);
    // Placed clear of the press point so the press below lands on `field`, not
    // the topmost overlapping control - the second field only proves focus is
    // not lost to it while `field` is editing.
    other.setPosition(0, 50);
    harness.scene.ui.addChild(other);
    press(harness, 5, 18);
    type('ab');

    harness.signals.onKeyDown.dispatch(Keyboard.Left);

    expect(harness.im.focused).toBe(field);
    expect(field.selectionStart).toBe(1);
  });

  test('Escape releases focus and stays unconsumed', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    expect(harness.im.focused).toBe(field);

    harness.signals.onKeyDown.dispatch(Keyboard.Escape);

    expect(harness.im.focused).toBeNull();
  });

  test('onChange and onSubmit fire from transport edits and Enter', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });
    const values: string[] = [];
    const submits: string[] = [];

    field.onChange.add(value => values.push(value));
    field.onSubmit.add(value => submits.push(value));
    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    type('ab');

    expect(values).toEqual(['a', 'ab']);

    harness.signals.onKeyDown.dispatch(Keyboard.Enter);

    expect(submits).toEqual(['ab']);
  });

  test('readOnly rejects transport edits', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, readOnly: true });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    expect(fireBeforeInput('insertText', { data: 'x' }).defaultPrevented).toBe(true);

    expect(field.value).toBe('');
  });

  test('maxLength truncates transport inserts', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, maxLength: 3 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abcd');

    expect(field.value).toBe('abc');
  });

  test('a paste that the filter rejects is dropped whole', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    field.filter = candidate => !candidate.includes('x');
    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    fireBeforeInput('insertFromPaste', { dataTransfer: { getData: () => 'exit' } });

    expect(field.value).toBe('');
  });

  test('a newline from the transport is refused in a single-line field', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');

    expect(fireBeforeInput('insertLineBreak').defaultPrevented).toBe(true);

    expect(field.value).toBe('ab');
  });

  test('a masked field renders the mask and the transport refuses clipboard reads', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, maskChar: '*' });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');

    expect(field.value).toBe('ab');
    expect(field.renderedText).toBe('**');
    expect(field.textNode.text).toBe('**');

    const copy = new Event('copy', { cancelable: true, bubbles: true });

    transportTextarea().dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);

    // Cut is refused as an edit, and cancelling it cancels the clipboard write.
    expect(fireBeforeInput('deleteByCut').defaultPrevented).toBe(true);
    expect(field.value).toBe('ab');
  });

  test('an unmasked cut is forwarded so the clipboard write survives', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');
    field.selectAll();

    expect(fireBeforeInput('deleteByCut').defaultPrevented).toBe(false);
    expect(field.value).toBe('');

    const copy = new Event('copy', { cancelable: true, bubbles: true });

    transportTextarea().dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false);
  });

  test('a Backspace the transport already applied is not applied a second time', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abc');

    // What one physical Backspace produces in a browser: the host's semantic
    // edit first, the engine's key event at the next frame boundary.
    fireBeforeInput('deleteContentBackward');
    harness.signals.onKeyDown.dispatch(Keyboard.Backspace);

    expect(field.value).toBe('ab');

    // A keystroke the transport did not report still edits - a host that
    // reports no edit of its own leaves the key handler in charge.
    harness.signals.onKeyDown.dispatch(Keyboard.Backspace);

    expect(field.value).toBe('a');
  });

  test('a modifier held when the field loses focus does not stay held', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abc');

    harness.signals.onKeyDown.dispatch(Keyboard.ShiftLeft);
    field.blur();
    field.focus();

    // The Shift release happened while another node held focus, so the widget
    // never saw it.
    harness.signals.onKeyDown.dispatch(Keyboard.Left);

    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(2);
  });

  test('releasing one Shift while the other is held keeps the selection extending', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abc');

    harness.signals.onKeyDown.dispatch(Keyboard.ShiftLeft);
    harness.signals.onKeyDown.dispatch(Keyboard.ShiftRight);
    harness.signals.onKeyUp.dispatch(Keyboard.ShiftLeft);
    harness.signals.onKeyDown.dispatch(Keyboard.Left);

    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(3);
  });

  test('the editing shortcuts answer to Meta as well as Control', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abc');

    harness.signals.onKeyDown.dispatch(Keyboard.MetaLeft);
    harness.signals.onKeyDown.dispatch(Keyboard.A);

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(3);

    harness.signals.onKeyDown.dispatch(Keyboard.Z);

    expect(field.value).toBe('');
  });

  test('a read-only field can still be selected whole', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, value: 'abc', readOnly: true });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    harness.signals.onKeyDown.dispatch(Keyboard.ControlLeft);
    harness.signals.onKeyDown.dispatch(Keyboard.A);

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(3);

    // Mutating shortcuts stay refused.
    harness.signals.onKeyDown.dispatch(Keyboard.Z);

    expect(field.value).toBe('abc');
  });

  test('a null seam leaves the field visible and focused but not editable', () => {
    const platform = new BrowserPlatform(document.createElement('canvas'));

    Object.defineProperty(platform, 'createTextInput', { value: () => null });

    const harness = createUIApp(platform);
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    expect(harness.im.focused).toBe(field);
    expect(document.body.querySelector('textarea')).toBeNull();
    expect(field.visible).toBe(true);

    harness.signals.onKeyDown.dispatch(Keyboard.Backspace);
    harness.signals.onKeyDown.dispatch(Keyboard.Left);

    expect(field.value).toBe('');
    expect(harness.im.focused).toBe(field);
  });

  test('composition text stays out of the value until it commits', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const textarea = transportTextarea();
    const fire = (type: string, data: string): void => {
      const event = new Event(type, { cancelable: true, bubbles: true }) as CompositionEvent;

      Object.defineProperty(event, 'data', { value: data });
      textarea.dispatchEvent(event);
    };

    fire('compositionstart', '');
    fireBeforeInput('insertCompositionText', { data: 'k' });
    fire('compositionupdate', 'ka');
    fire('compositionend', 'ka');

    expect(field.value).toBe('ka');
    expect(field.renderedText).toBe('ka');
  });

  test('the caret follows the composition candidate while it is in flight', () => {
    const platform = new BrowserPlatform(document.createElement('canvas'));
    const caretRects: Rectangle[] = [];
    const create = platform.createTextInput.bind(platform);

    Object.defineProperty(platform, 'createTextInput', {
      value: (): PlatformTextInput | null => {
        const seam = create();

        if (seam === null) {
          return null;
        }

        const setCaretRect = seam.setCaretRect.bind(seam);

        seam.setCaretRect = (rect: Rectangle): void => {
          caretRects.push(rect.clone());
          setCaretRect(rect);
        };

        return seam;
      },
    });

    const harness = createUIApp(platform);
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const textarea = transportTextarea();
    const fire = (type: string, data: string): void => {
      const event = new Event(type, { cancelable: true, bubbles: true }) as CompositionEvent;

      Object.defineProperty(event, 'data', { value: data });
      textarea.dispatchEvent(event);
    };

    fire('compositionstart', '');
    fire('compositionupdate', 'k');

    const oneGlyph = caretRects.at(-1);

    fire('compositionupdate', 'kan');

    const threeGlyphs = caretRects.at(-1);

    // Advance is 10 per glyph and the content box starts at inset 8: the caret
    // sits behind the candidate, which lives outside `value` entirely.
    expect(oneGlyph?.x).toBe(18);
    expect(threeGlyphs?.x).toBe(38);
  });

  test('runs of spaces are laid out one glyph each, so hit testing stays aligned', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('a  b');

    expect(field.value).toBe('a  b');

    // Four glyphs at advance 10 from inset 8. Collapsed whitespace would place
    // 'b' at glyph 2 and answer 2 here.
    press(harness, 8 + 32, 18);
    expect(field.selectionStart).toBe(3);

    press(harness, 8 + 45, 18);
    expect(field.selectionStart).toBe(4);
  });

  test('the transport mirrors value and selection after edits', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');

    const textarea = transportTextarea();

    expect(textarea.value).toBe('ab');
    expect(textarea.selectionStart).toBe(2);
  });

  test('hints reach the transport element', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, inputMode: 'numeric', enterKeyHint: 'go' });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const textarea = transportTextarea();

    expect(textarea.inputMode).toBe('numeric');
    expect(textarea.enterKeyHint).toBe('go');
  });

  test('the placeholder shows while the field is empty and hides once text arrives', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, placeholder: 'Name' });

    harness.scene.ui.addChild(field);

    expect(field.placeholderNode.visible).toBe(true);
    expect(field.placeholderNode.text).toBe('Name');

    press(harness, 5, 18);
    type('a');

    expect(field.placeholderNode.visible).toBe(false);
  });
});
