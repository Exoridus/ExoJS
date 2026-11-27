/**
 * The `<textarea>` transport: what a hint snapshot reaches on the host element,
 * and that dropping a hint restores the host default instead of leaving the
 * last one in place.
 */

import { BrowserTextInput } from '#platform/BrowserTextInput';

const transportElement = (): HTMLTextAreaElement => {
  const element = document.body.querySelector('textarea[aria-hidden="true"]');

  if (element === null) {
    throw new Error('the backend created no transport element');
  }

  return element as HTMLTextAreaElement;
};

afterEach(() => {
  document.body.querySelectorAll('textarea[aria-hidden="true"]').forEach(element => element.remove());
});

describe('BrowserTextInput hints', () => {
  test('applies the hints the widget supplies', () => {
    const backend = new BrowserTextInput(document.createElement('canvas'));

    backend.setHints({ inputMode: 'numeric', enterKeyHint: 'go' });

    expect(transportElement().inputMode).toBe('numeric');
    expect(transportElement().enterKeyHint).toBe('go');

    backend.destroy();
  });

  test('dropping a hint restores the host default instead of keeping the last one', () => {
    const backend = new BrowserTextInput(document.createElement('canvas'));

    backend.setHints({ inputMode: 'numeric', enterKeyHint: 'go' });
    // The widget rebuilds the snapshot and omits unset members.
    backend.setHints({});

    expect(transportElement().inputMode).toBe('');
    expect(transportElement().enterKeyHint).toBe('');

    backend.destroy();
  });
});

describe('BrowserTextInput editing', () => {
  test.each([
    ['insertText', { kind: 'insert', text: 'x', range: { start: 1, end: 2 } }],
    ['insertCompositionText', { kind: 'insert', text: 'x', range: { start: 1, end: 2 } }],
    ['insertFromPaste', { kind: 'insert', text: 'x', source: 'paste', range: { start: 1, end: 2 } }],
    ['insertLineBreak', { kind: 'insert', text: '\n', range: { start: 1, end: 2 } }],
    ['deleteContentBackward', { kind: 'deleteContent', direction: 'backward', granularity: 'character', range: { start: 1, end: 2 } }],
    ['deleteContentForward', { kind: 'deleteContent', direction: 'forward', granularity: 'character', range: { start: 1, end: 2 } }],
    ['deleteWordBackward', { kind: 'deleteContent', direction: 'backward', granularity: 'word', range: { start: 1, end: 2 } }],
    ['deleteWordForward', { kind: 'deleteContent', direction: 'forward', granularity: 'word', range: { start: 1, end: 2 } }],
    ['deleteSoftLineBackward', { kind: 'deleteContent', direction: 'backward', granularity: 'line', range: { start: 1, end: 2 } }],
    ['deleteSoftLineForward', { kind: 'deleteContent', direction: 'forward', granularity: 'line', range: { start: 1, end: 2 } }],
    ['historyUndo', { kind: 'historyUndo' }],
    ['historyRedo', { kind: 'historyRedo' }],
  ] as const)('%s emits one intent and cancels the host edit', (inputType, expected) => {
    const backend = new BrowserTextInput(document.createElement('canvas'));
    const listener = vi.fn();
    backend.onEdit.add(listener);
    backend.setValue('abc', 1, 2);
    const event = new InputEvent('beforeinput', { inputType, data: 'x', cancelable: true });

    transportElement().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(expected);
    backend.destroy();
  });

  test.each([false, true])('cut cancellation follows masking=%s', masked => {
    const backend = new BrowserTextInput(document.createElement('canvas'));
    backend.setHints({ masked });
    const listener = vi.fn();
    backend.onEdit.add(listener);
    const event = new InputEvent('beforeinput', { inputType: 'deleteByCut', cancelable: true });

    transportElement().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(masked);
    expect(listener).toHaveBeenCalledTimes(masked ? 0 : 1);
    backend.destroy();
  });

  test('composition suppresses beforeinput edits', () => {
    const backend = new BrowserTextInput(document.createElement('canvas'));
    const listener = vi.fn();
    backend.onEdit.add(listener);
    const element = transportElement();
    element.dispatchEvent(new CompositionEvent('compositionstart'));
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', cancelable: true });

    element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    backend.destroy();
  });
});
