import { ObservableVector } from '#math/ObservableVector';

describe('ObservableVector.destroy()', () => {
  // destroy() should not throw
  test('destroy() does not throw', () => {
    const v = new ObservableVector(() => {}, 1, 2);

    expect(() => v.destroy()).not.toThrow();
  });

  // Calling destroy() twice is safe
  test('destroy() is safe to call twice', () => {
    const v = new ObservableVector(() => {}, 1, 2);

    expect(() => {
      v.destroy();
      v.destroy();
    }).not.toThrow();
  });

  // Callback is no longer invoked after destroy()
  test('callback is no longer invoked after destroy()', () => {
    const spy = vi.fn();
    const v = new ObservableVector(spy, 0, 0);

    // Confirm callback fires before destroy
    v.x = 10;
    expect(spy).toHaveBeenCalledTimes(1);

    v.destroy();
    spy.mockClear();

    // Now mutations should NOT invoke the callback
    v.x = 20;
    v.y = 30;
    v.set(40, 50);

    expect(spy).not.toHaveBeenCalled();
  });

  // Setting x/y after destroy() still mutates the values (no error)
  test('setting values after destroy() still works without throwing', () => {
    const v = new ObservableVector(() => {}, 0, 0);

    v.destroy();

    expect(() => {
      v.x = 5;
      v.y = 10;
    }).not.toThrow();

    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
  });
});
