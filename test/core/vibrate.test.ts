import { vibrate } from '@/core/utils';

describe('vibrate()', () => {
  test('returns false when navigator.vibrate is unavailable', () => {
    const original = navigator.vibrate;
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });

    expect(vibrate(100)).toBe(false);

    Object.defineProperty(navigator, 'vibrate', { value: original, configurable: true });
  });

  test('calls navigator.vibrate and returns its result', () => {
    const mock = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', { value: mock, configurable: true });

    const result = vibrate([200, 100, 200]);

    expect(mock).toHaveBeenCalledWith([200, 100, 200]);
    expect(result).toBe(true);

    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });
  });
});
