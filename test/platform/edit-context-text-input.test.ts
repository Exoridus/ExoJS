import { Rectangle } from '#math/Rectangle';
import { editContextSupported, EditContextTextInput } from '#platform/EditContextTextInput';
import type { CompositionState, TextEditIntent } from '#platform/PlatformTextInput';

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

    expect(edits).toEqual([{ kind: 'insert', text: 'c' }]);
  });

  test('a textupdate that only removes text is forwarded as a character delete', () => {
    const { backend, edits } = createBackend();

    backend.setValue('abc', 3, 3);
    lastContext().emit('textupdate', { updateRangeStart: 2, updateRangeEnd: 3, text: '', selectionStart: 2, selectionEnd: 2 });

    expect(edits).toEqual([{ kind: 'deleteContent', direction: 'forward', granularity: 'character' }]);

    lastContext().emit('textupdate', { updateRangeStart: 1, updateRangeEnd: 2, text: '', selectionStart: 1, selectionEnd: 2 });

    expect(edits.at(-1)).toEqual({ kind: 'deleteContent', direction: 'backward', granularity: 'character' });
  });

  test('a composition reports start, every candidate and the commit', () => {
    const { compositions } = createBackend();
    const context = lastContext();

    context.emit('compositionstart', {});
    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 0, text: 'k', selectionStart: 1, selectionEnd: 1 });
    context.emit('textupdate', { updateRangeStart: 0, updateRangeEnd: 1, text: 'kan', selectionStart: 3, selectionEnd: 3 });
    context.emit('compositionend', { text: 'kan' });

    expect(compositions).toEqual([
      { phase: 'start' },
      { phase: 'update', text: 'k', caret: 1 },
      { phase: 'update', text: 'kan', caret: 3 },
      { phase: 'end', text: 'kan' },
    ]);
  });

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
    expect(edits).toEqual([{ kind: 'deleteContent', direction: 'backward', granularity: 'character' }]);
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
    expect(edits).toEqual([{ kind: 'insert', text: 'pasted' }]);
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

  test('hints reach the context', () => {
    const { backend } = createBackend();

    backend.setHints({ inputMode: 'numeric', enterKeyHint: 'go' });

    expect(lastContext().inputMode).toBe('numeric');
    expect(lastContext().enterKeyHint).toBe('go');
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
