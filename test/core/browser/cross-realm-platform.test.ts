import { FrameLoop } from '#core/application/FrameLoop';
import { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { BrowserTextInput } from '#platform/BrowserTextInput';
import { EditContextTextInput } from '#platform/EditContextTextInput';
import type { PlatformTextInput } from '#platform/PlatformTextInput';

interface NativeContext extends EventTarget {
  text: string;
  updateControlBounds(bounds: DOMRect): void;
  updateSelectionBounds(bounds: DOMRect): void;
  updateCharacterBounds(start: number, bounds: DOMRect[]): void;
}

type RealmWindow = Window & typeof globalThis & {
  EditContext: new (options?: Record<string, unknown>) => NativeContext;
};

type TransportInternals = { _element: HTMLElement; _context: NativeContext };

let frame: HTMLIFrameElement;
let ownerDocument: Document;
let ownerWindow: RealmWindow;
let canvas: HTMLCanvasElement;
let platform: BrowserPlatform;
const transports: PlatformTextInput[] = [];
const platforms: BrowserPlatform[] = [];
const frames: HTMLIFrameElement[] = [];

const keep = <T extends PlatformTextInput>(input: T): T => {
  transports.push(input);

  return input;
};

const elementOf = (input: PlatformTextInput): HTMLElement => (input as unknown as TransportInternals)._element;
const contextOf = (input: PlatformTextInput): NativeContext => (input as unknown as TransportInternals)._context;

beforeEach(() => {
  frame = document.createElement('iframe');
  frame.style.width = '320px';
  frame.style.height = '240px';
  document.body.append(frame);
  frames.push(frame);
  ownerDocument = frame.contentDocument!;
  ownerWindow = frame.contentWindow as RealmWindow;
  canvas = ownerDocument.createElement('canvas');
  canvas.tabIndex = 0;
  ownerDocument.body.append(canvas);
  platform = new BrowserPlatform(canvas);
  platforms.push(platform);
});

afterEach(() => {
  for (const input of transports.splice(0)) {
    input.destroy();
  }

  for (const adapter of platforms.splice(0)) {
    adapter.destroy();
  }

  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  for (const item of frames.splice(0)) {
    item.remove();
  }
});

test('textarea elements belong to the canvas document and DOM realm', () => {
  const input = keep(new BrowserTextInput(canvas));
  const element = elementOf(input);

  expect(element.ownerDocument).toBe(ownerDocument);
  expect(element).toBeInstanceOf(ownerWindow.HTMLTextAreaElement);
  expect(element).not.toBeInstanceOf(HTMLTextAreaElement);
  expect(ownerDocument.body.contains(element)).toBe(true);
  expect(document.body.contains(element)).toBe(false);
});

test('textarea focus, keyboard delivery, edits and composition stay in the owner document', () => {
  const input = keep(new BrowserTextInput(canvas));
  const element = elementOf(input) as HTMLTextAreaElement;
  const edits = vi.fn();
  const compositions = vi.fn();
  const keys = vi.fn();
  const parentKeys = vi.fn();
  const unsubscribe = platform.onWindowEvent('keydown', keys);

  window.addEventListener('keydown', parentKeys);

  try {
    input.onEdit.add(edits);
    input.onComposition.add(compositions);
    input.setValue('abc', 1, 2);
    input.setHints({ inputMode: 'text', enterKeyHint: 'done' });
    input.focus();

    expect(ownerDocument.activeElement).toBe(element);
    expect(input.hostFocused).toBe(true);
    expect(element.selectionStart).toBe(1);
    expect(element.selectionEnd).toBe(2);
    expect(element.enterKeyHint).toBe('done');

    element.dispatchEvent(new ownerWindow.KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
    expect(keys).toHaveBeenCalledTimes(1);
    expect(parentKeys).not.toHaveBeenCalled();

    const edit = new ownerWindow.InputEvent('beforeinput', { inputType: 'insertText', data: 'x', cancelable: true });
    element.dispatchEvent(edit);
    expect(edit.defaultPrevented).toBe(true);
    expect(edits).toHaveBeenCalledWith({ kind: 'insert', text: 'x' });

    element.dispatchEvent(new ownerWindow.CompositionEvent('compositionstart'));
    element.dispatchEvent(new ownerWindow.CompositionEvent('compositionupdate', { data: '漢' }));
    const composing = new ownerWindow.InputEvent('beforeinput', { inputType: 'insertCompositionText', data: '漢', cancelable: true });
    element.dispatchEvent(composing);
    input.setValue('not mirrored while composing', 0, 0);
    expect(element.value).toBe('abc');
    expect(composing.defaultPrevented).toBe(false);
    expect(edits).toHaveBeenCalledTimes(1);
    element.dispatchEvent(new ownerWindow.CompositionEvent('compositionend', { data: '漢' }));
    expect(compositions.mock.calls.map(call => call[0])).toEqual([
      { phase: 'start' },
      { phase: 'update', text: '漢', caret: 1 },
      { phase: 'end', text: '漢' },
    ]);

    input.blur();
    expect(ownerDocument.activeElement).toBe(canvas);
    expect(input.hostFocused).toBe(false);
  } finally {
    unsubscribe();
    window.removeEventListener('keydown', parentKeys);
  }
});

test.each(['textarea', 'edit-context'])('%s placement uses the owner viewport and its scroll offset', backend => {
  const input = keep(backend === 'textarea' ? new BrowserTextInput(canvas) : new EditContextTextInput(canvas));
  ownerDocument.body.style.minHeight = '2400px';
  canvas.style.position = 'absolute';
  canvas.style.left = '120px';
  canvas.style.top = '500px';
  ownerWindow.scrollTo(0, 250);
  expect(ownerWindow.scrollY).toBe(250);

  const bounds = new Rectangle(5, 9, 40, 20);
  input.setBounds(bounds);
  const surfaceRect = canvas.getBoundingClientRect();
  const inputRect = elementOf(input).getBoundingClientRect();

  expect(inputRect.left).toBeCloseTo(surfaceRect.left + 5, 2);
  expect(inputRect.top).toBeCloseTo(surfaceRect.top + 9, 2);
  expect(inputRect.width).toBeCloseTo(40, 2);
  expect(inputRect.height).toBeCloseTo(20, 2);
  bounds.destroy();
});

test('the factory falls back when only the owner realm lacks EditContext', () => {
  expect(typeof (globalThis as unknown as RealmWindow).EditContext).toBe('function');
  Object.defineProperty(ownerWindow, 'EditContext', { configurable: true, value: undefined });
  const input = keep(platform.createTextInput()!);

  expect(input).toBeInstanceOf(BrowserTextInput);
  expect(elementOf(input).ownerDocument).toBe(ownerDocument);
});

test('the factory uses native owner EditContext even when the caller realm lacks it', () => {
  const OwnerContext = ownerWindow.EditContext;
  expect(typeof OwnerContext).toBe('function');
  vi.stubGlobal('EditContext', undefined);
  const input = keep(platform.createTextInput()!);

  expect(input).toBeInstanceOf(EditContextTextInput);
  expect(contextOf(input)).toBeInstanceOf(OwnerContext);
  expect(elementOf(input).ownerDocument).toBe(ownerDocument);
});

test('native EditContext uses owner DOMRects and preserves focus and composition signals', () => {
  const input = keep(new EditContextTextInput(canvas));
  const context = contextOf(input);
  const element = elementOf(input);
  const control = vi.spyOn(context, 'updateControlBounds');
  const selection = vi.spyOn(context, 'updateSelectionBounds');
  const characters = vi.spyOn(context, 'updateCharacterBounds');
  const edits = vi.fn();
  const compositions = vi.fn();
  const bounds = new Rectangle(4, 6, 90, 20);

  expect(context).toBeInstanceOf(ownerWindow.EditContext);
  expect(element.ownerDocument).toBe(ownerDocument);
  input.onEdit.add(edits);
  input.onComposition.add(compositions);
  input.setValue('abc', 1, 1);
  input.setBounds(bounds);
  input.setCaretRect(bounds);
  expect(control.mock.calls[0]![0]).toBeInstanceOf(ownerWindow.DOMRect);
  expect(selection.mock.calls[0]![0]).toBeInstanceOf(ownerWindow.DOMRect);

  context.dispatchEvent(Object.assign(new ownerWindow.Event('characterboundsupdate'), { rangeStart: 0, rangeEnd: 2 }));
  expect(characters.mock.calls[0]![1]).toHaveLength(2);
  expect(characters.mock.calls[0]![1][0]).toBeInstanceOf(ownerWindow.DOMRect);

  input.focus();
  expect(ownerDocument.activeElement).toBe(element);
  expect(input.hostFocused).toBe(true);
  context.dispatchEvent(new ownerWindow.Event('compositionstart'));
  context.dispatchEvent(Object.assign(new ownerWindow.Event('textupdate'), {
    updateRangeStart: 1, updateRangeEnd: 1, text: '漢', selectionStart: 2, selectionEnd: 2,
  }));
  input.setValue('not mirrored while composing', 0, 0);
  expect(context.text).toBe('abc');
  expect(edits).not.toHaveBeenCalled();
  context.dispatchEvent(new ownerWindow.CompositionEvent('compositionend', { data: '漢' }));
  expect(compositions.mock.calls.map(call => call[0])).toEqual([
    { phase: 'start' },
    { phase: 'update', text: '漢', caret: 1 },
    { phase: 'end', text: '漢' },
  ]);
  input.blur();
  expect(ownerDocument.activeElement).toBe(canvas);
  bounds.destroy();
});

test('the platform reports its text-focus claim during the canvas blur handoff', () => {
  const input = keep(platform.createTextInput()!);
  const claims: boolean[] = [];
  canvas.addEventListener('blur', () => claims.push(platform.textInputFocused), { once: true });
  platform.focusSurface();
  input.focus();

  expect(claims).toEqual([true]);
  expect(platform.textInputFocused).toBe(true);
  expect(ownerDocument.activeElement).toBe(elementOf(input));
  input.blur();
  expect(platform.surfaceFocused).toBe(true);
  expect(platform.textInputFocused).toBe(false);
});

test('platform clocks read the same owner realm as its frame timestamps', () => {
  const clock = vi.spyOn(ownerWindow.performance, 'now').mockReturnValue(1234.5);

  expect(platform.now()).toBe(1234.5);
  expect(clock).toHaveBeenCalledTimes(1);
});

test('FrameLoop requests and cancels frames on the same owner window', () => {
  const ownerRequest = vi.spyOn(ownerWindow, 'requestAnimationFrame');
  const ownerCancel = vi.spyOn(ownerWindow, 'cancelAnimationFrame');
  const parentRequest = vi.spyOn(window, 'requestAnimationFrame');
  const parentCancel = vi.spyOn(window, 'cancelAnimationFrame');
  const loop = new FrameLoop(platform, vi.fn(), 1000 / 60);

  try {
    loop.start();
    expect(ownerRequest).toHaveBeenCalledTimes(1);
    expect(parentRequest).not.toHaveBeenCalled();
    const handle = ownerRequest.mock.results[0]!.value;
    expect(loop.stop()).toBe(true);
    expect(ownerCancel).toHaveBeenCalledWith(handle);
    expect(parentCancel).not.toHaveBeenCalled();
    expect(loop.stop()).toBe(false);
  } finally {
    loop.stop();
    loop.destroy();
  }
});

test('cancellation retains the original frame realm after its iframe is removed', async () => {
  const ownerCancel = vi.spyOn(ownerWindow, 'cancelAnimationFrame');
  const pending = vi.fn();
  const handle = platform.requestFrame(pending);
  frame.remove();
  expect(() => platform.cancelFrame(handle)).not.toThrow();
  expect(ownerCancel).toHaveBeenCalledWith(handle);

  const sibling = document.createElement('iframe');
  document.body.append(sibling);
  frames.push(sibling);
  const otherCanvas = sibling.contentDocument!.createElement('canvas');
  sibling.contentDocument!.body.append(otherCanvas);
  const other = new BrowserPlatform(otherCanvas);
  platforms.push(other);
  const timestamp = await new Promise<number>(resolve => other.requestFrame(resolve));
  expect(Number.isFinite(timestamp)).toBe(true);
  expect(pending).not.toHaveBeenCalled();
});

test.each(['textarea', 'edit-context'])('%s listeners and owner-window listeners detach after frame removal', backend => {
  const input = keep(backend === 'textarea' ? new BrowserTextInput(canvas) : new EditContextTextInput(canvas));
  const element = elementOf(input);
  const edits = vi.fn();
  const keys = vi.fn();
  input.onEdit.add(edits);
  const unsubscribe = platform.onWindowEvent('keydown', keys, { capture: true });
  const key = new ownerWindow.KeyboardEvent('keydown', { code: 'KeyA' });
  const edit = new ownerWindow.InputEvent('beforeinput', { inputType: 'insertText', data: 'x' });
  const update = Object.assign(new ownerWindow.Event('textupdate'), {
    updateRangeStart: 0, updateRangeEnd: 0, text: 'x', selectionStart: 1, selectionEnd: 1,
  });
  const context = backend === 'edit-context' ? contextOf(input) : null;

  frame.remove();
  expect(() => {
    input.destroy();
    input.destroy();
    platform.destroy();
    platform.destroy();
    unsubscribe();
  }).not.toThrow();
  expect(element.isConnected).toBe(false);
  ownerWindow.dispatchEvent(key);
  element.dispatchEvent(edit);
  context?.dispatchEvent(update);
  expect(keys).not.toHaveBeenCalled();
  expect(edits).not.toHaveBeenCalled();
});

test('a document without a window still owns its textarea and does not borrow the caller EditContext', () => {
  const detachedDocument = document.implementation.createHTMLDocument('no browsing context');
  const detachedCanvas = detachedDocument.createElement('canvas');
  detachedDocument.body.append(detachedCanvas);
  const detached = new BrowserPlatform(detachedCanvas);
  platforms.push(detached);
  expect(detachedDocument.defaultView).toBeNull();
  const input = keep(detached.createTextInput()!);

  expect(input).toBeInstanceOf(BrowserTextInput);
  expect(elementOf(input).ownerDocument).toBe(detachedDocument);
  expect(detachedDocument.body.contains(elementOf(input))).toBe(true);
});
