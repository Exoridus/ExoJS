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

  // set() without arguments defaults both components to their current values,
  // so it is a no-op that also does not notify.
  test('set() with no arguments is a no-op and does not notify', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 3, 4);

    v.set();

    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ObservableVector angle/length overrides', () => {
  // The subclass must redeclare the getter next to each setter override —
  // a setter-only accessor on the subclass prototype would shadow the whole
  // inherited accessor pair and leave `get` undefined.
  test('reading .angle works like AbstractVector.angle', () => {
    const v = new ObservableVector(null, 0, 0, 5);

    expect(v.angle).toBeCloseTo(Math.PI / 2);
  });

  test('reading .length works like AbstractVector.length', () => {
    const v = new ObservableVector(null, 0, 3, 4);

    expect(v.length).toBe(5);
  });

  test('angle setter rotates the vector, preserving length, and notifies once', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 0, 5);

    v.angle = 0;

    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('length setter rescales the vector, preserving direction, and notifies once', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 3, 4);

    v.length = 10;

    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('ObservableVector.add() / subtract() overrides', () => {
  test('add() notifies once via set()', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 1, 1);

    v.add(2, 3);

    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('add() defaults y to x when omitted', () => {
    const v = new ObservableVector(null, 0, 1, 1);

    v.add(5);

    expect(v.x).toBe(6);
    expect(v.y).toBe(6);
  });

  test('subtract() notifies once via set()', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 5, 5);

    v.subtract(1, 2);

    expect(v.x).toBe(4);
    expect(v.y).toBe(3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('subtract() defaults y to x when omitted', () => {
    const v = new ObservableVector(null, 0, 5, 5);

    v.subtract(2);

    expect(v.x).toBe(3);
    expect(v.y).toBe(3);
  });
});

describe('ObservableVector.scale()', () => {
  test('multiplies both components explicitly and notifies once', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 2, 3);

    v.scale(2, 4);

    expect(v.x).toBe(4);
    expect(v.y).toBe(12);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('defaults y to x when omitted (uniform scale)', () => {
    const v = new ObservableVector(null, 0, 2, 3);

    v.scale(2);

    expect(v.x).toBe(4);
    expect(v.y).toBe(6);
  });
});

describe('ObservableVector.divide() override', () => {
  test('divides both components explicitly and notifies once', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 10, 20);

    v.divide(2, 4);

    expect(v.x).toBe(5);
    expect(v.y).toBe(5);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('defaults y to x when omitted', () => {
    const v = new ObservableVector(null, 0, 10, 20);

    v.divide(2);

    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
  });

  test('skips the division and does not notify when x is zero', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 10, 20);

    const result = v.divide(0, 5);

    expect(result).toBe(v);
    expect(v.x).toBe(10);
    expect(v.y).toBe(20);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('skips the division and does not notify when y is zero', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 10, 20);

    v.divide(2, 0);

    expect(v.x).toBe(10);
    expect(v.y).toBe(20);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ObservableVector.clone()', () => {
  test('returns a distinct instance with the same owner, channel, and components', () => {
    const onChange = vi.fn();
    const owner = { _onObservableChange: onChange };
    const v = new ObservableVector(owner, 3, 1, 2);
    const clone = v.clone();

    expect(clone).not.toBe(v);
    expect(clone.x).toBe(1);
    expect(clone.y).toBe(2);

    // The clone shares the same owner/channel, so mutating it notifies too.
    clone.x = 9;
    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});

describe('ObservableVector.copy()', () => {
  test('copies x/y from any AbstractVector and notifies once', () => {
    const onChange = vi.fn();
    const v = new ObservableVector({ _onObservableChange: onChange }, 0, 0, 0);
    const source = new ObservableVector(null, 0, 7, 8);

    const result = v.copy(source);

    expect(result).toBe(v);
    expect(v.x).toBe(7);
    expect(v.y).toBe(8);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
