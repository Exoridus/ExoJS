import { ObservableSize } from '#math/ObservableSize';
import { Size } from '#math/Size';

describe('ObservableSize', () => {
  test('defaults width and height to 0', () => {
    const callback = vi.fn();
    const size = new ObservableSize(callback);

    expect(size.width).toBe(0);
    expect(size.height).toBe(0);
    expect(callback).not.toHaveBeenCalled();

    size.destroy();
  });

  test('constructor accepts explicit width and height without firing the callback', () => {
    const callback = vi.fn();
    const size = new ObservableSize(callback, 10, 20);

    expect(size.width).toBe(10);
    expect(size.height).toBe(20);
    expect(callback).not.toHaveBeenCalled();

    size.destroy();
  });

  describe('width setter', () => {
    test('fires the callback when the value changes', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 1);

      size.width = 5;

      expect(size.width).toBe(5);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('does not fire the callback when set to the same value', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 1);

      size.width = 1;

      expect(callback).not.toHaveBeenCalled();

      size.destroy();
    });
  });

  describe('height setter', () => {
    test('fires the callback when the value changes', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 1);

      size.height = 5;

      expect(size.height).toBe(5);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('does not fire the callback when set to the same value', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 1);

      size.height = 1;

      expect(callback).not.toHaveBeenCalled();

      size.destroy();
    });
  });

  describe('set()', () => {
    test('fires the callback at most once for a combined width+height change', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 1);

      size.set(5, 6);

      expect(size.width).toBe(5);
      expect(size.height).toBe(6);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('does not fire the callback when both values are unchanged', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 5, 6);

      size.set(5, 6);

      expect(callback).not.toHaveBeenCalled();

      size.destroy();
    });

    test('fires when only width changes', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 5, 6);

      size.set(9, 6);

      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('fires when only height changes', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 5, 6);

      size.set(5, 9);

      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('defaults to current width/height when called with no arguments', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 5, 6);

      size.set();

      expect(size.width).toBe(5);
      expect(size.height).toBe(6);
      expect(callback).not.toHaveBeenCalled();

      size.destroy();
    });

    test('returns this for chaining', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback);

      expect(size.set(1, 1)).toBe(size);

      size.destroy();
    });
  });

  describe('add()', () => {
    test('adds independently for width/height and fires once', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 2);

      size.add(3, 4);

      expect(size.width).toBe(4);
      expect(size.height).toBe(6);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('applies a single argument uniformly', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 2);

      size.add(3);

      expect(size.width).toBe(4);
      expect(size.height).toBe(5);

      size.destroy();
    });
  });

  describe('subtract()', () => {
    test('subtracts independently for width/height and fires once', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 10, 10);

      size.subtract(3, 4);

      expect(size.width).toBe(7);
      expect(size.height).toBe(6);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('applies a single argument uniformly', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 10, 10);

      size.subtract(3);

      expect(size.width).toBe(7);
      expect(size.height).toBe(7);

      size.destroy();
    });
  });

  describe('scale()', () => {
    test('scales independently for width/height and fires once', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 2, 3);

      size.scale(2, 4);

      expect(size.width).toBe(4);
      expect(size.height).toBe(12);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('applies a single argument uniformly', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 2, 3);

      size.scale(2);

      expect(size.width).toBe(4);
      expect(size.height).toBe(6);

      size.destroy();
    });
  });

  describe('divide()', () => {
    test('divides independently for width/height and fires once', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 10, 20);

      size.divide(2, 5);

      expect(size.width).toBe(5);
      expect(size.height).toBe(4);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
    });

    test('applies a single argument uniformly', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 10, 20);

      size.divide(2);

      expect(size.width).toBe(5);
      expect(size.height).toBe(10);

      size.destroy();
    });
  });

  describe('copy()', () => {
    test('copies width/height from another Size and fires the callback', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 1, 1);
      const source = new Size(42, 24);

      size.copy(source);

      expect(size.width).toBe(42);
      expect(size.height).toBe(24);
      expect(callback).toHaveBeenCalledTimes(1);

      size.destroy();
      source.destroy();
    });

    test('does not fire the callback when copying identical values', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 5, 6);
      const source = new Size(5, 6);

      size.copy(source);

      expect(callback).not.toHaveBeenCalled();

      size.destroy();
      source.destroy();
    });
  });

  describe('clone()', () => {
    test('produces an independent ObservableSize with the same callback and values', () => {
      const callback = vi.fn();
      const size = new ObservableSize(callback, 7, 9);
      const clone = size.clone();

      expect(clone).not.toBe(size);
      expect(clone.width).toBe(7);
      expect(clone.height).toBe(9);

      clone.width = 100;
      expect(callback).toHaveBeenCalledTimes(1);
      expect(size.width).toBe(7);

      size.destroy();
      clone.destroy();
    });
  });
});
