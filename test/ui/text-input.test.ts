import { SceneState } from '#core/scene/SceneState';
import { Keyboard } from '#input/types';
import type { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { PlatformTextInput } from '#platform/PlatformTextInput';
import { Button } from '#ui/Button';
import { TextInput } from '#ui/TextInput';

import { frameDelta } from '../support/frame-delta';
import { createUIApp, fireBeforeInput, makePointer, press, transportTextarea, type } from '../support/text-field-harness';

const nativeKey = (eventType: 'keydown' | 'keyup', code: string): KeyboardEvent => {
  const event = new KeyboardEvent(eventType, { code, bubbles: true, cancelable: true });

  transportTextarea().dispatchEvent(event);

  return event;
};

describe('TextInput', () => {
  test('a canvas click needs the interaction frame before native typing reaches the field', () => {
    const { scene, im } = createUIApp(null, true);
    const app = scene.app;
    const canvas = app.canvas as HTMLCanvasElement;
    const field = new TextInput({ width: 200, height: 36 });
    const save = new Button({ label: 'Save', width: 100, height: 36 });

    canvas.width = 800;
    canvas.height = 600;
    canvas.tabIndex = 0;
    document.body.append(canvas);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
    Object.assign(app, { _backingStoreToLogical: (x: number, y: number) => ({ x, y }) });
    save.y = 100;
    scene.ui.addChild(field, save);
    field.focus();
    save.focus();

    const typeAtHostFocus = (text: string): void => {
      for (const char of text) {
        const target = document.activeElement!;
        const code = `Key${char.toUpperCase()}`;
        const down = new KeyboardEvent('keydown', { code, key: char, bubbles: true, cancelable: true });

        target.dispatchEvent(down);

        // jsdom has no native editing default. A real browser produces
        // beforeinput only when the key actually reaches an editable host.
        if (!down.defaultPrevented && target instanceof HTMLTextAreaElement) {
          target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: char, bubbles: true, cancelable: true }));
        }

        target.dispatchEvent(new KeyboardEvent('keyup', { code, key: char, bubbles: true }));
      }
    };

    try {
      for (const eventType of ['pointerover', 'pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(eventType, {
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            clientX: 100,
            clientY: 18,
            buttons: eventType === 'pointerdown' ? 1 : 0,
            bubbles: true,
          }),
        );
      }

      expect(field.focused).toBe(false);
      expect(app.platform.textInputFocused).toBe(false);
      expect(document.activeElement).toBe(canvas);
      typeAtHostFocus('Grac');
      expect(field.value).toBe('');
      app.input.preFrame(frameDelta);
      expect(field.focused).toBe(false);
      im.preFrame(frameDelta);
      app.input._finishInteractionFrame();
      expect(field.focused).toBe(true);
      expect(app.platform.textInputFocused).toBe(true);
      expect(document.activeElement).toBe(transportTextarea());
      typeAtHostFocus('e');
      expect(field.value).toBe('e');

      field.value = '';
      typeAtHostFocus('Grace');
      app.input.preFrame(frameDelta);
      im.preFrame(frameDelta);
      app.input._finishInteractionFrame();
      expect(field.value).toBe('Grace');
      expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
      expect(transportTextarea().value).toBe('Grace');
    } finally {
      canvas.remove();
    }
  });

  test.each(['deleteContentBackward', 'insertFromPaste'])(
    'native textarea %s honors selection before the engine shortcut frame',
    inputType => {
      const { scene } = createUIApp(null, true);
      const field = new TextInput({ width: 200 });

      scene.ui.addChild(field);
      field.focus();
      field.value = 'Ada';
      nativeKey('keydown', 'ControlLeft');
      nativeKey('keydown', 'KeyA');
      nativeKey('keyup', 'KeyA');
      nativeKey('keyup', 'ControlLeft');
      expect([transportTextarea().selectionStart, transportTextarea().selectionEnd]).toEqual([0, 3]);

      if (inputType === 'deleteContentBackward') {
        const deletion = nativeKey('keydown', 'Backspace');

        expect(deletion.defaultPrevented).toBe(true);
        nativeKey('keyup', 'Backspace');
      } else {
        fireBeforeInput(inputType, { data: 'Grace' });
      }

      scene.app.input.preFrame(frameDelta);
      scene.app.input._finishInteractionFrame();
      const expected = inputType === 'deleteContentBackward' ? '' : 'Grace';

      expect(field.value).toBe(expected);
      expect([field.selectionStart, field.selectionEnd]).toEqual([expected.length, expected.length]);
      expect(transportTextarea().value).toBe(expected);
    },
  );

  test('native history intents apply once while their queued shortcut still reaches the input frame', () => {
    const { scene } = createUIApp(null, true);
    const field = new TextInput({ width: 200 });

    scene.ui.addChild(field);
    field.focus();
    fireBeforeInput('insertFromPaste', { data: 'first' });
    fireBeforeInput('insertFromPaste', { data: ' second' });
    nativeKey('keydown', 'ControlLeft');
    expect(nativeKey('keydown', 'KeyZ').defaultPrevented).toBe(true);
    nativeKey('keyup', 'KeyZ');
    nativeKey('keyup', 'ControlLeft');
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();

    expect(field.value).toBe('first');

    nativeKey('keydown', 'ControlLeft');
    nativeKey('keydown', 'ShiftLeft');
    expect(nativeKey('keydown', 'KeyZ').defaultPrevented).toBe(true);
    nativeKey('keyup', 'KeyZ');
    nativeKey('keyup', 'ShiftLeft');
    nativeKey('keyup', 'ControlLeft');
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();
    expect(field.value).toBe('first second');

    // Native menu commands still enter through the semantic transport alone.
    fireBeforeInput('historyUndo');
    expect(field.value).toBe('first');
    fireBeforeInput('historyRedo');
    expect(field.value).toBe('first second');
  });

  test('custom intents without native range metadata retain relative editing and delete deduplication', () => {
    const platform = new BrowserPlatform(document.createElement('canvas'));
    const createOriginal = platform.createTextInput.bind(platform);
    const create = vi.spyOn(platform, 'createTextInput').mockImplementation(() => {
      const seam = createOriginal();

      if (seam !== null) {
        Reflect.deleteProperty(seam, '_synchronousKeyboard');
      }

      return seam;
    });
    const { scene } = createUIApp(platform, true);
    const field = new TextInput({ width: 200 });

    scene.ui.addChild(field);
    field.focus();
    field.value = 'Ada';
    const seam = create.mock.results[0]!.value!;

    seam.onEdit.dispatch({ kind: 'insert', text: 'B' });
    expect(field.value).toBe('AdaB');

    nativeKey('keydown', 'Backspace');
    seam.onEdit.dispatch({ kind: 'deleteContent', direction: 'backward', granularity: 'character' });
    nativeKey('keyup', 'Backspace');
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();
    expect(field.value).toBe('Ada');

    nativeKey('keydown', 'Backspace');
    nativeKey('keyup', 'Backspace');
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();
    expect(field.value).toBe('Ad');
  });

  test.each(['transition', 'inactive', 'unfocusable'] as const)(
    'a %s field rejects native follow-up edits as well as capture commands',
    gate => {
      const { scene } = createUIApp(null, true);
      const field = new TextInput({ value: 'Ada' });

      scene.ui.addChild(field);
      field.focus();

      if (gate === 'transition') {
        Object.assign(scene.app.scenes, { _transitionGateOpen: true });
      } else if (gate === 'inactive') {
        Object.assign(scene.app.scenes, { state: SceneState.Ready });
      } else {
        field.focusable = false;
      }

      expect(nativeKey('keydown', 'Backspace').defaultPrevented).toBe(false);
      fireBeforeInput('deleteContentBackward');
      nativeKey('keyup', 'Backspace');
      expect(field.value).toBe('Ada');
      expect(transportTextarea().value).toBe('Ada');
      scene.app.input.preFrame(frameDelta);
      scene.app.input._finishInteractionFrame();
      expect(field.value).toBe('Ada');
    },
  );

  test.each([
    { modifiers: ['AltLeft'], inputType: 'deleteWordBackward', expected: 'one ' },
    { modifiers: ['MetaLeft'], inputType: 'deleteSoftLineBackward', expected: '' },
    { modifiers: ['ControlLeft', 'ShiftLeft'], inputType: 'deleteSoftLineBackward', expected: '' },
  ])('native $inputType semantics survive $modifiers and the later key frame', ({ modifiers, inputType, expected }) => {
    const { scene } = createUIApp(null, true);
    const field = new TextInput({ value: 'one two' });

    scene.ui.addChild(field);
    field.focus();

    for (const modifier of modifiers) {
      nativeKey('keydown', modifier);
    }

    expect(nativeKey('keydown', 'Backspace').defaultPrevented).toBe(false);
    fireBeforeInput(inputType);
    nativeKey('keyup', 'Backspace');

    for (const modifier of modifiers) {
      nativeKey('keyup', modifier);
    }

    fireBeforeInput('insertText', { data: 'x' });
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();
    expect(field.value).toBe(`${expected}x`);
    expect(field.selectionStart).toBe(expected.length + 1);
  });

  test('range-bearing custom edits do not leave pending legacy delete counters unconsumed', () => {
    const platform = new BrowserPlatform(document.createElement('canvas'));
    const createOriginal = platform.createTextInput.bind(platform);
    const create = vi.spyOn(platform, 'createTextInput').mockImplementation(() => {
      const seam = createOriginal();

      if (seam !== null) {
        Reflect.deleteProperty(seam, '_synchronousKeyboard');
      }

      return seam;
    });
    const { scene } = createUIApp(platform, true);
    const field = new TextInput({ width: 200 });

    scene.ui.addChild(field);
    field.focus();
    field.value = 'abc';
    const seam = create.mock.results[0]!.value!;

    nativeKey('keydown', 'Backspace');
    seam.onEdit.dispatch({ kind: 'deleteContent', direction: 'backward', granularity: 'character' });
    nativeKey('keyup', 'Backspace');
    nativeKey('keydown', 'KeyX');
    seam.onEdit.dispatch({ kind: 'insert', text: 'x', range: { start: 2, end: 2 } });
    nativeKey('keyup', 'KeyX');
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();
    expect(field.value).toBe('abx');

    nativeKey('keydown', 'Backspace');
    nativeKey('keyup', 'Backspace');
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();
    expect(field.value).toBe('ab');
  });

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

  test('a press on empty canvas blurs the field and tears down its transport', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    expect(harness.im.focused).toBe(field);
    expect(document.body.querySelector('textarea')).not.toBeNull();

    press(harness, 500, 500);

    expect(harness.im.focused).toBeNull();
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  test('a press-drag extends a selection from the anchor', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('hello');

    harness.signals.onPointerMove.dispatch(makePointer(57, 18), 57, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);

    harness.signals.onPointerUp.dispatch(makePointer(57, 18), 57, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);
  });

  test('ignores a drag while its transform is singular', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });
    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('hello');
    const selection = [field.selectionStart, field.selectionEnd];
    field.scale.set(0, 1);

    expect(() => harness.signals.onPointerMove.dispatch(makePointer(57, 18), 57, 18)).not.toThrow();
    expect([field.selectionStart, field.selectionEnd]).toEqual(selection);
    field.scale.set(1, 1);
    harness.signals.onPointerMove.dispatch(makePointer(57, 18), 57, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);
  });

  test('a second contact neither extends the selection nor ends the drag', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('hello');

    // A second press at the caret's own end, so the drag starts collapsed.
    press(harness, 103, 18);

    expect(field.selectionStart).toBe(5);

    harness.signals.onPointerMove.dispatch(makePointer(5, 18, 2), 5, 18);

    expect(field.selectionStart).toBe(5);
    expect(field.selectionEnd).toBe(5);

    harness.signals.onPointerUp.dispatch(makePointer(5, 18, 2), 5, 18);
    harness.signals.onPointerMove.dispatch(makePointer(5, 18), 5, 18);

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

  test('a masked field re-renders when maskChar is set after construction', () => {
    const field = new TextInput({ value: 'secret' });

    expect(field.textNode.text).toBe('secret');

    field.maskChar = '*';

    expect(field.renderedText).toBe('******');
    expect(field.textNode.text).toBe('******');
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

  test.each([Keyboard.Backspace, Keyboard.Delete])('Shift with delete removes one grapheme', key => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });
    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abcd');
    press(harness, 31, 18);
    expect(field.selectionStart).toBe(2);
    harness.signals.onKeyDown.dispatch(Keyboard.ShiftLeft);
    harness.signals.onKeyDown.dispatch(key);
    expect(field.value).toBe(key === Keyboard.Backspace ? 'acd' : 'abd');
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

    // Advance is 10 per glyph and the content box starts at inset 12: the caret
    // sits behind the candidate, which lives outside `value` entirely.
    expect(oneGlyph?.x).toBe(22);
    expect(threeGlyphs?.x).toBe(42);
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

  test('undo takes back a paste on its own, not the typing before it', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');
    fireBeforeInput('insertFromPaste', { dataTransfer: { getData: () => 'cd' } });
    expect(field.value).toBe('abcd');

    fireBeforeInput('historyUndo');

    expect(field.value).toBe('ab');
  });

  test('destroying a field that left the scene mid-drag unsubscribes its pointer handlers', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const before = harness.signals.onPointerMove.count;
    const upBefore = harness.signals.onPointerUp.count;

    expect(before).toBeGreaterThan(0);

    harness.scene.ui.removeChild(field);
    field.destroy();

    expect(harness.signals.onPointerMove.count).toBeLessThan(before);
    expect(harness.signals.onPointerUp.count).toBeLessThan(upBefore);
  });

  test('clearing maskChar re-enables clipboard reads', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, maskChar: '*' });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');
    field.selectAll();

    const masked = new Event('copy', { cancelable: true, bubbles: true });

    transportTextarea().dispatchEvent(masked);
    expect(masked.defaultPrevented).toBe(true);

    field.maskChar = null;

    const unmasked = new Event('copy', { cancelable: true, bubbles: true });

    transportTextarea().dispatchEvent(unmasked);
    expect(unmasked.defaultPrevented).toBe(false);
  });
});
