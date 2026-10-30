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
