import { Signal } from '@codexo/exojs';
import { act, render } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { useSignal } from '../src/useSignal';

/** Reads a live counter through `useSignal` and renders it as text. */
function Counter({ signal, getValue }: { signal: Signal<[number]> | null; getValue: () => number }): ReactElement {
  const value = useSignal(signal, getValue);

  return <span data-testid="value">{value}</span>;
}

describe('useSignal', () => {
  it('returns the initial snapshot on first render without any dispatch', () => {
    const signal = new Signal<[number]>();
    let counter = 0;
    const { getByTestId } = render(<Counter signal={signal} getValue={() => counter} />);

    expect(getByTestId('value').textContent).toBe('0');
    counter = 5; // Mutating the closed-over value alone must not update the render.
    expect(getByTestId('value').textContent).toBe('0');
  });

  it('re-renders with the new snapshot every time the signal dispatches', () => {
    const signal = new Signal<[number]>();
    let counter = 0;
    const { getByTestId } = render(<Counter signal={signal} getValue={() => counter} />);

    counter = 1;
    act(() => {
      signal.dispatch(1);
    });
    expect(getByTestId('value').textContent).toBe('1');

    counter = 2;
    act(() => {
      signal.dispatch(2);
    });
    expect(getByTestId('value').textContent).toBe('2');
  });

  it('unsubscribes the internal listener on unmount', () => {
    const signal = new Signal<[number]>();
    const { unmount } = render(<Counter signal={signal} getValue={() => 0} />);

    expect(signal.count).toBe(1);
    unmount();
    expect(signal.count).toBe(0);
  });

  it('resubscribes when the signal identity changes', () => {
    const signalA = new Signal<[number]>();
    const signalB = new Signal<[number]>();
    const { rerender } = render(<Counter signal={signalA} getValue={() => 0} />);

    expect(signalA.count).toBe(1);

    rerender(<Counter signal={signalB} getValue={() => 0} />);

    expect(signalA.count).toBe(0);
    expect(signalB.count).toBe(1);
  });

  it('tolerates a null signal (e.g. before the Application exists) and still reads getSnapshot', () => {
    const { getByTestId } = render(<Counter signal={null} getValue={() => 42} />);

    expect(getByTestId('value').textContent).toBe('42');
  });
});
