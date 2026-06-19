import { ObservableVector } from '#math/ObservableVector';

describe('ObservableVector.destroy()', () => {
  // destroy() should not throw
  test('destroy() does not throw', () => {
    const v = new ObservableVector(null, 0, 1, 2);

    expect(() => v.destroy()).not.toThrow();
  });

  // Calling destroy() twice is safe
  test('destroy() is safe to call twice', () => {
    const v = new ObservableVector(null, 0, 1, 2);

    expect(() => {
      v.destroy();
      v.destroy();
    }).not.toThrow();
  });

  // Owner is no longer notified after destroy()
  test('owner is no longer notified after destroy()', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 0, 0);

    // Confirm the owner is notified before destroy
    v.x = 10;
    expect(onChange).toHaveBeenCalledTimes(1);

    v.destroy();
    onChange.mockClear();

    // Now mutations should NOT notify the owner
    v.x = 20;
    v.y = 30;
    v.set(40, 50);

    expect(onChange).not.toHaveBeenCalled();
  });

  // Setting x/y after destroy() still mutates the values (no error)
  test('setting values after destroy() still works without throwing', () => {
    const v = new ObservableVector(null, 0, 0, 0);

    v.destroy();

    expect(() => {
      v.x = 5;
      v.y = 10;
    }).not.toThrow();

    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
  });
});

describe('ObservableVector owner notification', () => {
  // The owner is notified with the channel the vector was constructed with, so
  // one owner can disambiguate several vectors without a per-vector closure.
  test('notifies the owner with its channel on change', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 7, 0, 0);

    v.x = 1;
    expect(onChange).toHaveBeenLastCalledWith(7);

    v.y = 2;
    expect(onChange).toHaveBeenLastCalledWith(7);

    v.set(3, 4);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  // No notification fires when a component is set to its current value.
  test('does not notify when the value is unchanged', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 5, 6);

    v.x = 5;
    v.y = 6;
    v.set(5, 6);

    expect(onChange).not.toHaveBeenCalled();
  });

  // A null owner is a plain, non-reactive vector (no callbacks, no throw).
  test('a null owner mutates silently', () => {
    const v = new ObservableVector(null, 0, 0, 0);

    expect(() => {
      v.x = 1;
      v.set(2, 3);
    }).not.toThrow();

    expect(v.x).toBe(2);
    expect(v.y).toBe(3);
  });
});
