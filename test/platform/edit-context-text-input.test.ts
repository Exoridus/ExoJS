import { logger } from '#core/Logger';
import type { InputSystem } from '#input/InputSystem';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { editContextSupported, EditContextTextInput } from '#platform/EditContextTextInput';
import type { CompositionState, TextEditIntent } from '#platform/PlatformTextInput';
import { Button } from '#ui/Button';
import { TextArea } from '#ui/TextArea';
import { TextInput } from '#ui/TextInput';

import { frameDelta } from '../support/frame-delta';
import { createUIApp } from '../support/text-field-harness';

/**
 * Minimal stand-in for the `EditContext` API: jsdom ships none, and the
 * backend only ever touches the mirror (`text`, selection) and the four events
 * it subscribes to. Bounds updates are recorded so the geometry contract can
 * be asserted without a layout engine.
 */
class FakeEditContext {
  public text = '';
  public selectionStart = 0;
  public selectionEnd = 0;
  public inputMode = '';
  public enterKeyHint = '';
  public controlBounds: DOMRect | null = null;
  public selectionBounds: DOMRect | null = null;
  public characterBounds: { rangeStart: number; bounds: DOMRect[] } | null = null;

  private readonly _listeners = new Map<string, Set<(event: never) => void>>();

  public updateText(rangeStart: number, rangeEnd: number, text: string): void {
    this.text = this.text.slice(0, rangeStart) + text + this.text.slice(rangeEnd);
  }

  public updateSelection(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  public updateControlBounds(bounds: DOMRect): void {
    this.controlBounds = bounds;
  }

  public updateSelectionBounds(bounds: DOMRect): void {
    this.selectionBounds = bounds;
  }

  public updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void {
    this.characterBounds = { rangeStart, bounds };
  }

  public addEventListener(type: string, listener: (event: never) => void): void {
    let set = this._listeners.get(type);

    if (set === undefined) {
      set = new Set();
      this._listeners.set(type, set);
    }

    set.add(listener);
  }

  public removeEventListener(type: string, listener: (event: never) => void): void {
    this._listeners.get(type)?.delete(listener);
  }

  public listenerCount(type: string): number {
    return this._listeners.get(type)?.size ?? 0;
  }

  public emit(type: string, event: unknown): void {
    for (const listener of this._listeners.get(type) ?? []) {
      (listener as (value: unknown) => void)(event);
    }
  }
}

let contexts: FakeEditContext[] = [];

const lastContext = (): FakeEditContext => {
  const context = contexts.at(-1);

  if (context === undefined) {
    throw new Error('no EditContext was constructed');
  }

  return context;
};

const transportElement = (): HTMLDivElement => {
  const element = document.body.querySelector('div[aria-hidden="true"]');

  if (element === null) {
    throw new Error('the backend created no transport element');
  }

  return element as HTMLDivElement;
};

/** A clipboard event jsdom can dispatch, with a data store the test can read back. */
const clipboardEvent = (type: 'copy' | 'cut' | 'paste', initial = ''): { event: Event; read: () => string } => {
  const store = new Map<string, string>([['text/plain', initial]]);
  const event = new Event(type, { cancelable: true, bubbles: true });

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (format: string): string => store.get(format) ?? '',
      setData: (format: string, value: string): void => {
        store.set(format, value);
      },
    },
  });

  return { event, read: (): string => store.get('text/plain') ?? '' };
};

beforeEach(() => {
  contexts = [];
  (globalThis as { EditContext?: unknown }).EditContext = class extends FakeEditContext {
    public constructor() {
      super();
      contexts.push(this);
    }
  };
});

afterEach(() => {
  delete (globalThis as { EditContext?: unknown }).EditContext;
  document.body.querySelectorAll('div[aria-hidden="true"]').forEach(element => element.remove());
});

const createBackend = (): { backend: EditContextTextInput; edits: TextEditIntent[]; compositions: CompositionState[] } => {
  const backend = new EditContextTextInput(document.createElement('canvas'));
  const edits: TextEditIntent[] = [];
  const compositions: CompositionState[] = [];

  backend.onEdit.add(intent => edits.push(intent));
  backend.onComposition.add(state => compositions.push(state));

  return { backend, edits, compositions };
};

const nativeField = (value = 'Ada'): { field: TextInput; input: InputSystem; scene: ReturnType<typeof createUIApp>['scene'] } => {
  const { scene } = createUIApp(null, true);
  const field = new TextInput({ width: 200 });

  scene.ui.addChild(field);
  field.focus();
  field.value = value;

  return { field, input: scene.app.input, scene };
};

const nativeKey = (type: 'keydown' | 'keyup', code: string, repeat = false): KeyboardEvent => {
  const event = new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true });

  transportElement().dispatchEvent(event);

  return event;
};

const nativeSelectAll = (): void => {
  nativeKey('keydown', 'ControlLeft');
  nativeKey('keydown', 'KeyA');
  nativeKey('keyup', 'KeyA');
  nativeKey('keyup', 'ControlLeft');
};

const nativeUpdate = (start: number, end: number, text: string): void => {
  const context = lastContext();
  const caret = start + text.length;

  context.updateText(start, end, text);
  context.updateSelection(caret, caret);
  context.emit('textupdate', {
    updateRangeStart: start,
    updateRangeEnd: end,
    text,
    selectionStart: caret,
    selectionEnd: caret,
  });
};

describe('EditContext native edits before the engine key frame', () => {
  test('select-all and Backspace work before a frame without host caret navigation', () => {
    const { field, input } = nativeField();
    const down = vi.fn();

    input.onKeyDown.add(down);
    nativeSelectAll();
    const deletion = nativeKey('keydown', 'Backspace');

    if (!deletion.defaultPrevented) {
      const context = lastContext();
      const start = context.selectionStart === context.selectionEnd ? Math.max(0, context.selectionStart - 1) : context.selectionStart;

      nativeUpdate(start, context.selectionEnd, '');
    }

    nativeKey('keyup', 'Backspace');

    expect(field.value).toBe('');
    expect(down).not.toHaveBeenCalled();
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0]);
    expect(down.mock.calls.map(([channel]) => channel)).toEqual([Keyboard.ControlLeft, Keyboard.A, Keyboard.Backspace]);
  });

  test('select-all synchronizes EditContext before copy or composition begins', () => {
    const { field } = nativeField();

    nativeSelectAll();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
    expect([lastContext().selectionStart, lastContext().selectionEnd]).toEqual([0, 3]);
    const { event, read } = clipboardEvent('copy');

    transportElement().dispatchEvent(event);
    expect(read()).toBe('Ada');
    lastContext().emit('compositionstart', {});
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0]);
  });

  test('a late select-all does not reselect a native replacement after the key frame drains', () => {
    const { field, input } = nativeField();

    nativeSelectAll();
    nativeKey('keydown', 'KeyB');
    nativeUpdate(lastContext().selectionStart, lastContext().selectionEnd, 'B');
    nativeKey('keyup', 'KeyB');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('B');
    expect([field.selectionStart, field.selectionEnd]).toEqual([1, 1]);
  });

  test('native Delete followed by typing retains its final caret when an earlier arrow drains', () => {
    const { field, input } = nativeField('ab');

    nativeKey('keydown', 'ArrowLeft');
    nativeKey('keyup', 'ArrowLeft');
    expect(lastContext().selectionStart).toBe(1);
    const deletion = nativeKey('keydown', 'Delete');

    if (!deletion.defaultPrevented) {
      nativeUpdate(lastContext().selectionStart, lastContext().selectionEnd + 1, '');
    }

    nativeKey('keyup', 'Delete');
    nativeKey('keydown', 'KeyX');
    nativeUpdate(1, 1, 'x');
    nativeKey('keyup', 'KeyX');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('ax');
    expect([field.selectionStart, field.selectionEnd]).toEqual([2, 2]);

    nativeKey('keydown', 'ArrowLeft');
    nativeKey('keyup', 'ArrowLeft');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect([field.selectionStart, field.selectionEnd]).toEqual([1, 1]);
  });

  test('undo before a new native insertion applies before the replacement range is computed', () => {
    const { field, input } = nativeField('');

    nativeUpdate(0, 0, 'first');
    const { event } = clipboardEvent('paste', ' second');

    transportElement().dispatchEvent(event);
    nativeKey('keydown', 'ControlLeft');
    nativeKey('keydown', 'KeyZ');
    nativeKey('keyup', 'KeyZ');
    nativeKey('keyup', 'ControlLeft');
    expect(lastContext().text).toBe('first');
    nativeKey('keydown', 'KeyX');
    nativeUpdate(lastContext().selectionStart, lastContext().selectionEnd, 'x');
    nativeKey('keyup', 'KeyX');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.value).toBe('firstx');
    expect([field.selectionStart, field.selectionEnd]).toEqual([6, 6]);
  });

  test('repeat moves the native caret without adding repeated global key presses', () => {
    const { field, input } = nativeField();
    const down = vi.fn();

    input.onKeyDown.add(down);
    nativeKey('keydown', 'ArrowLeft');
    nativeKey('keydown', 'ArrowLeft', true);
    expect(lastContext().selectionStart).toBe(1);
    nativeKey('keyup', 'ArrowLeft');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.selectionStart).toBe(1);
    expect(down).toHaveBeenCalledExactlyOnceWith(Keyboard.Left);
  });

  test('composition owns arrows and Enter even when it commits before the input frame', () => {
    const { field, input } = nativeField();
    const submit = vi.fn();

    field.onSubmit.add(submit);
    lastContext().emit('compositionstart', {});
    nativeUpdate(3, 3, 'kan');
    expect(nativeKey('keydown', 'ArrowLeft').defaultPrevented).toBe(false);
    nativeKey('keyup', 'ArrowLeft');
    expect(nativeKey('keydown', 'Enter').defaultPrevented).toBe(false);
    lastContext().emit('compositionend', { data: 'kan' });
    nativeKey('keyup', 'Enter');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('Adakan');
    expect([field.selectionStart, field.selectionEnd]).toEqual([6, 6]);
    expect(submit).not.toHaveBeenCalled();
  });

  test('a captured multiline Enter cannot activate a button focused by its change callback', () => {
    const { scene } = createUIApp(null, true);
    const field = new TextArea({ value: 'Ada' });
    const button = new Button({ label: 'Save' });
    const activate = vi.fn();
    const down = vi.fn();

    scene.ui.addChild(field, button);
    button.onClick.add(activate);
    field.onChange.add(() => button.focus());
    scene.app.input.onKeyDown.add(down);
    field.focus();
    expect(nativeKey('keydown', 'Enter').defaultPrevented).toBe(true);
    expect(field.value).toBe('Ada\n');
    expect(button.focused).toBe(true);
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();

    expect(activate).not.toHaveBeenCalled();
    expect(down).toHaveBeenCalledExactlyOnceWith(Keyboard.Enter);
    expect(scene.app.input._textEditKeyCapture).toBeNull();
  });

  test('capture-time editing stays with its owner when focus moves to another field before drain', () => {
    const { scene } = createUIApp(null, true);
    const first = new TextInput({ value: 'Ada' });
    const second = new TextInput({ value: 'Bea' });

    scene.ui.addChild(first, second);
    first.focus();
    nativeKey('keydown', 'ArrowLeft');
    nativeKey('keyup', 'ArrowLeft');
    expect(first.selectionStart).toBe(2);
    second.focus();
    scene.app.input.preFrame(frameDelta);
    scene.app.input._finishInteractionFrame();

    expect(second.focused).toBe(true);
    expect([second.selectionStart, second.selectionEnd]).toEqual([3, 3]);
    nativeKey('keydown', 'ArrowLeft');
    expect(second.selectionStart).toBe(2);
  });

  test('a command can destroy its field without leaving a capture or replaying its mutation', () => {
    const { field, input } = nativeField();
    const down = vi.fn();

    input.onKeyDown.add(down);
    field.onChange.add(() => field.destroy());
    expect(nativeKey('keydown', 'Backspace').defaultPrevented).toBe(true);
    expect(field.destroyed).toBe(true);
    expect(input._textEditKeyCapture).toBeNull();
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(down).toHaveBeenCalledExactlyOnceWith(Keyboard.Backspace);
  });

  test('a throwing change listener reports once and cannot replay its already applied command', () => {
    const { field, input, scene } = nativeField();
    const failure = new Error('change listener');
    const errors = vi.fn();
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});

    scene.app.onError.add(errors);
    field.onChange.add(() => {
      throw failure;
    });

    try {
      expect(nativeKey('keydown', 'Backspace').defaultPrevented).toBe(true);
      nativeKey('keyup', 'Backspace');
      expect(field.value).toBe('Ad');
      expect(lastContext().text).toBe('Ad');
      expect(errors).toHaveBeenCalledExactlyOnceWith(failure);
      input.preFrame(frameDelta);
      input._finishInteractionFrame();
      expect(field.value).toBe('Ad');
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  test('returning focus installs a fresh capture that another field teardown cannot remove', () => {
    const { field, input, scene } = nativeField();
    const firstCapture = input._textEditKeyCapture;
    const other = new TextInput({ value: 'Bea' });

    scene.ui.addChild(other);
    other.focus();
    field.focus();
    const currentCapture = input._textEditKeyCapture;

    expect(currentCapture).not.toBe(firstCapture);
    other.destroy();
    expect(input._textEditKeyCapture).toBe(currentCapture);
    nativeKey('keydown', 'ArrowLeft');
    nativeKey('keyup', 'ArrowLeft');
    expect(field.selectionStart).toBe(2);
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.selectionStart).toBe(2);
  });

  test('reentrant native key capture preserves the outer command first in the frame journal', () => {
    const { field, input } = nativeField();
    const down = vi.fn();
    let nested = false;

    input.onKeyDown.add(down);
    field.onChange.add(() => {
      if (!nested) {
        nested = true;
        nativeKey('keydown', 'ArrowLeft');
        nativeKey('keyup', 'ArrowLeft');
      }
    });
    nativeKey('keydown', 'Backspace');
    nativeKey('keyup', 'Backspace');
    expect(field.value).toBe('Ad');
    expect(field.selectionStart).toBe(1);
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('Ad');
    expect(field.selectionStart).toBe(1);
    expect(down.mock.calls.map(([channel]) => channel)).toEqual([Keyboard.Backspace, Keyboard.Left]);
  });

  test('native word deletion keeps its default and applies the returned range once', () => {
    const { field, input } = nativeField('one two');

    nativeKey('keydown', 'AltLeft');
    expect(nativeKey('keydown', 'Backspace').defaultPrevented).toBe(false);
    nativeUpdate(4, 7, '');
    nativeKey('keyup', 'Backspace');
    nativeKey('keyup', 'AltLeft');
    nativeKey('keydown', 'KeyX');
    nativeUpdate(4, 4, 'x');
    nativeKey('keyup', 'KeyX');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.value).toBe('one x');
    expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
  });

  test('Alt-modified arrow navigation still updates EditContext without native caret movement', () => {
    const { field, input } = nativeField();

    nativeKey('keydown', 'AltLeft');
    expect(nativeKey('keydown', 'ArrowLeft').defaultPrevented).toBe(true);
    nativeKey('keyup', 'ArrowLeft');
    nativeKey('keyup', 'AltLeft');
    expect(lastContext().selectionStart).toBe(2);
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.selectionStart).toBe(2);
  });

  test('Control+Alt text entry keeps the native default and cannot replay as undo', () => {
    const { field, input } = nativeField();

    nativeKey('keydown', 'ControlLeft');
    nativeKey('keydown', 'AltRight');
    expect(nativeKey('keydown', 'KeyZ').defaultPrevented).toBe(false);
    nativeUpdate(3, 3, 'ž');
    nativeKey('keyup', 'KeyZ');
    nativeKey('keyup', 'AltRight');
    nativeKey('keyup', 'ControlLeft');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.value).toBe('Adaž');
    expect(field.selectionStart).toBe(4);
  });

  test('paste replaces the native selection and a late shortcut does not select the pasted text', () => {
    const { field, input } = nativeField();

    nativeSelectAll();
    nativeKey('keydown', 'ControlLeft');
    nativeKey('keydown', 'KeyV');
    const { event } = clipboardEvent('paste', 'Grace');

    transportElement().dispatchEvent(event);
    nativeKey('keyup', 'KeyV');
    nativeKey('keyup', 'ControlLeft');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe('Grace');
    expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
  });

  test('a native cut uses its range without swallowing a later non-native Backspace', () => {
    const { field, input } = nativeField();

    nativeSelectAll();
    nativeKey('keydown', 'ControlLeft');
    nativeKey('keydown', 'KeyX');
    const { event, read } = clipboardEvent('cut');

    transportElement().dispatchEvent(event);
    nativeKey('keyup', 'KeyX');
    nativeKey('keyup', 'ControlLeft');
    nativeKey('keydown', 'KeyB');
    nativeUpdate(0, 0, 'B');
    nativeKey('keyup', 'KeyB');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(read()).toBe('Ada');
    expect(field.value).toBe('B');
    expect([field.selectionStart, field.selectionEnd]).toEqual([1, 1]);

    nativeKey('keydown', 'Backspace');
    nativeKey('keyup', 'Backspace');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.value).toBe('');
  });

  test('native replacement offsets are UTF-16 offsets and still enforce the field value gate', () => {
    const { field, input } = nativeField('🙂Ada');

    field.maxLength = 3;
    nativeKey('keydown', 'KeyZ');
    nativeUpdate(2, 5, 'Z');
    nativeKey('keyup', 'KeyZ');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('🙂Z');
    expect([field.selectionStart, field.selectionEnd]).toEqual([3, 3]);
    expect(lastContext().text).toBe('🙂Z');
  });

  test.each(['readOnly', 'filter'] as const)('a refused %s native replacement restores the mirrored value and selection', refusal => {
    const { field, input } = nativeField();

    if (refusal === 'readOnly') {
      field.readOnly = true;
    } else {
      field.filter = candidate => candidate.startsWith('A');
    }

    nativeSelectAll();
    nativeKey('keydown', 'KeyB');
    nativeUpdate(0, 3, 'B');
    nativeKey('keyup', 'KeyB');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('Ada');
    expect(lastContext().text).toBe('Ada');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
    expect([lastContext().selectionStart, lastContext().selectionEnd]).toEqual([0, 3]);
  });

  test('unchanged native selection preserves one undo step for a contiguous typing run', () => {
    const { field, input } = nativeField('');

    nativeKey('keydown', 'KeyA');
    nativeUpdate(0, 0, 'a');
    nativeKey('keyup', 'KeyA');
    nativeKey('keydown', 'KeyB');
    nativeUpdate(1, 1, 'b');
    nativeKey('keyup', 'KeyB');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    nativeKey('keydown', 'ControlLeft');
    nativeKey('keydown', 'KeyZ');
    nativeKey('keyup', 'KeyZ');
    nativeKey('keyup', 'ControlLeft');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect(field.value).toBe('');
  });

  test('modifiers and editing keys captured after a native replacement still extend its selection', () => {
    const { field, input } = nativeField();

    nativeSelectAll();
    nativeKey('keydown', 'KeyB');
    nativeUpdate(0, 3, 'B');
    nativeKey('keyup', 'KeyB');
    nativeKey('keydown', 'ShiftLeft');
    nativeKey('keydown', 'ArrowLeft');
    nativeKey('keyup', 'ArrowLeft');
    nativeKey('keyup', 'ShiftLeft');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();

    expect(field.value).toBe('B');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 1]);

    nativeKey('keydown', 'ArrowRight');
    nativeKey('keyup', 'ArrowRight');
    input.preFrame(frameDelta);
    input._finishInteractionFrame();
    expect([field.selectionStart, field.selectionEnd]).toEqual([1, 1]);
  });
});

describe('EditContextTextInput', () => {
  test('editContextSupported follows the global', () => {
    expect(editContextSupported()).toBe(true);

    delete (globalThis as { EditContext?: unknown }).EditContext;
    expect(editContextSupported()).toBe(false);
  });

  test('the context is attached through the element that holds host focus', () => {
    const { backend } = createBackend();
    const element = transportElement() as HTMLDivElement & { editContext?: unknown };

    expect(element.editContext).toBe(lastContext());

    backend.destroy();

    expect(element.editContext).toBeNull();
  });

  test('a textupdate that adds text is forwarded as an insert', () => {
    const { backend, edits } = createBackend();

    backend.setValue('ab', 2, 2);
    lastContext().emit('textupdate', { updateRangeStart: 2, updateRangeEnd: 2, text: 'c', selectionStart: 3, selectionEnd: 3 });

    expect(edits).toEqual([{ kind: 'insert', text: 'c', range: { start: 2, end: 2 } }]);
  });

  test('a textupdate that only removes text is forwarded as a character delete', () => {
    const { backend, edits } = createBackend();

    // A platform collapses the selection to the start of the range it removed,
    // so a backspace and a forward delete emit the SAME event shape: only the
    // caret the widget mirrored in before the update tells them apart.
    backend.setValue('abc', 2, 2);
    lastContext().emit('textupdate', { updateRangeStart: 1, updateRangeEnd: 2, text: '', selectionStart: 1, selectionEnd: 1 });

    expect(edits).toEqual([{ kind: 'deleteContent', direction: 'backward', granularity: 'character', range: { start: 1, end: 2 } }]);

    backend.setValue('abc', 1, 1);
    lastContext().emit('textupdate', { updateRangeStart: 1, updateRangeEnd: 2, text: '', selectionStart: 1, selectionEnd: 1 });

    expect(edits.at(-1)).toEqual({ kind: 'deleteContent', direction: 'forward', granularity: 'character', range: { start: 1, end: 2 } });
  });

  test('deleting a non-empty selection removes what the selection covered', () => {
    const { backend, edits } = createBackend();

    backend.setValue('abcd', 1, 3);
    lastContext().emit('textupdate', { updateRangeStart: 1, updateRangeEnd: 3, text: '', selectionStart: 1, selectionEnd: 1 });

    expect(edits).toEqual([{ kind: 'deleteContent', direction: 'backward', granularity: 'character', range: { start: 1, end: 3 } }]);
  });

  test('a composition reports start, every candidate and the commit', () => {
    const { compositions } = createBackend();
    const context = lastContext();

    context.emit('compositionstart', {});
    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 0, text: 'k', selectionStart: 1, selectionEnd: 1 });
    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 1, text: 'kan', selectionStart: 3, selectionEnd: 3 });
    context.emit('compositionend', { data: 'kan' });

    expect(compositions).toEqual([
      { phase: 'start' },
      { phase: 'update', text: 'k', caret: 1 },
      { phase: 'update', text: 'kan', caret: 3 },
      { phase: 'end', text: 'kan' },
    ]);
  });

  test('a canceled composition without a final textupdate currently commits nothing', () => {
    const { edits, compositions } = createBackend();
    const context = lastContext();

    context.emit('compositionstart', {});
    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 0, text: 'kan', selectionStart: 3, selectionEnd: 3 });
    context.emit('compositionend', { data: '' });

    expect(compositions.at(-1)).toEqual({ phase: 'end', text: '' });
    expect(edits).toEqual([]);
  });

  test.each(['k', 'kan'])(
    'a textupdate outside a composition, after an empty-data composition end, is applied as a plain edit (%s)',
    text => {
      const { edits, compositions } = createBackend();
      const context = lastContext();

      context.emit('compositionstart', {});
      context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 0, text: 'k', selectionStart: 1, selectionEnd: 1 });
      context.emit('compositionend', { data: '' });
      context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 1, text, selectionStart: text.length, selectionEnd: text.length });

      expect(compositions).toEqual([{ phase: 'start' }, { phase: 'update', text: 'k', caret: 1 }, { phase: 'end', text: '' }]);
      expect(edits).toEqual([{ kind: 'insert', text, range: { start: 0, end: 1 } }]);
    },
  );

  test('a candidate never leaks into the edit signal', () => {
    const { edits } = createBackend();
    const context = lastContext();

    context.emit('compositionstart', {});
    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 0, text: 'k', selectionStart: 1, selectionEnd: 1 });

    expect(edits).toEqual([]);
  });

  test('the mirror is only written while no composition is in flight', () => {
    const { backend } = createBackend();
    const context = lastContext();

    backend.setValue('ab', 1, 2);
    expect(context.text).toBe('ab');
    expect([context.selectionStart, context.selectionEnd]).toEqual([1, 2]);

    context.emit('compositionstart', {});
    backend.setValue('zzz', 0, 0);

    expect(context.text).toBe('ab');
  });

  test('copy serves the clipboard from the mirror, because the element holds no selection', () => {
    const { backend } = createBackend();

    backend.setValue('hello world', 6, 11);

    const { event, read } = clipboardEvent('copy');

    transportElement().dispatchEvent(event);

    expect(read()).toBe('world');
    expect(event.defaultPrevented).toBe(true);
  });

  test('cut copies and asks for the deletion', () => {
    const { backend, edits } = createBackend();

    backend.setValue('hello world', 0, 5);

    const { event, read } = clipboardEvent('cut');

    transportElement().dispatchEvent(event);

    expect(read()).toBe('hello');
    expect(edits).toEqual([{ kind: 'deleteContent', direction: 'backward', granularity: 'character', range: { start: 0, end: 5 } }]);
  });

  test('a masked field writes nothing to the clipboard and deletes nothing', () => {
    const { backend, edits } = createBackend();

    backend.setValue('secret', 0, 6);
    backend.setHints({ masked: true });

    const copy = clipboardEvent('copy');
    const cut = clipboardEvent('cut');

    transportElement().dispatchEvent(copy.event);
    transportElement().dispatchEvent(cut.event);

    expect(copy.read()).toBe('');
    expect(cut.read()).toBe('');
    expect(edits).toEqual([]);
  });

  test('paste is cancelled and forwarded as an insert, so the model gates it', () => {
    const { edits } = createBackend();
    const { event } = clipboardEvent('paste', 'pasted');

    transportElement().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(edits).toEqual([{ kind: 'insert', text: 'pasted', source: 'paste', range: { start: 0, end: 0 } }]);
  });

  test('geometry reaches the context: control bounds, selection bounds, character bounds', () => {
    const { backend } = createBackend();
    const context = lastContext();

    backend.setBounds(new Rectangle(10, 20, 200, 30));
    backend.setCaretRect(new Rectangle(40, 20, 1, 24));
    context.emit('characterboundsupdate', { rangeStart: 2, rangeEnd: 5 });

    expect(context.controlBounds?.width).toBe(200);
    expect(context.selectionBounds?.x).toBe(40);
    expect(context.characterBounds?.rangeStart).toBe(2);
    expect(context.characterBounds?.bounds.length).toBe(3);
  });

  test('caret and character bounds use viewport coordinates', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 300, 150));
    const backend = new EditContextTextInput(canvas);
    const context = lastContext();
    backend.setBounds(new Rectangle(10, 20, 200, 30));
    backend.setCaretRect(new Rectangle(40, 25, 1, 24));
    context.emit('characterboundsupdate', { rangeStart: 0, rangeEnd: 2 });
    expect([context.controlBounds?.x, context.controlBounds?.y]).toEqual([110, 220]);
    expect([context.selectionBounds?.x, context.selectionBounds?.y]).toEqual([140, 225]);
    expect(context.characterBounds?.bounds.map(rect => [rect.x, rect.y])).toEqual([
      [140, 225],
      [140, 225],
    ]);
    backend.destroy();
  });

  test('hints reach the context', () => {
    const { backend } = createBackend();

    backend.setHints({ inputMode: 'numeric', enterKeyHint: 'go' });

    expect(lastContext().inputMode).toBe('numeric');
    expect(lastContext().enterKeyHint).toBe('go');
  });

  test('dropping a hint restores the host default instead of keeping the last one', () => {
    const { backend } = createBackend();

    backend.setHints({ inputMode: 'numeric', enterKeyHint: 'go' });
    // The widget rebuilds the snapshot and omits unset members.
    backend.setHints({});

    expect(lastContext().inputMode).toBe('');
    expect(lastContext().enterKeyHint).toBe('');
  });

  test('destroy detaches every listener and removes the element', () => {
    const { backend, edits } = createBackend();
    const context = lastContext();

    backend.destroy();

    expect(context.listenerCount('textupdate')).toBe(0);
    expect(document.body.querySelector('textarea')).toBeNull();

    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 0, text: 'x', selectionStart: 1, selectionEnd: 1 });
    expect(edits).toEqual([]);
  });

  test('the constructor refuses a host without the API', () => {
    delete (globalThis as { EditContext?: unknown }).EditContext;

    expect(() => new EditContextTextInput(document.createElement('canvas'))).toThrow(/EditContext/);
  });
});
