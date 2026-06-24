import { _resetWarnOnce, assert, assertDefined, invariant, warnOnce } from '#core/dev';

beforeEach(() => {
  _resetWarnOnce();
});

// ---------------------------------------------------------------------------
// assert
// ---------------------------------------------------------------------------

describe('assert', () => {
  test('does not throw when condition is true', () => {
    expect(() => assert(true, 'should not throw')).not.toThrow();
  });

  test('throws with prefixed message when condition is false', () => {
    expect(() => assert(false, 'test failure')).toThrow('[ExoJS] test failure');
  });

  test('throws an Error instance', () => {
    expect(() => assert(false, 'err')).toThrow(Error);
  });

  test('falls back to a default message when none is given', () => {
    expect(() => assert(false)).toThrow('[ExoJS] assertion failed');
  });
});

// ---------------------------------------------------------------------------
// assertDefined
// ---------------------------------------------------------------------------

describe('assertDefined', () => {
  test('throws when value is null', () => {
    expect(() => assertDefined(null, 'must not be null')).toThrow('[ExoJS] must not be null');
  });

  test('throws when value is undefined', () => {
    expect(() => assertDefined(undefined, 'must not be undefined')).toThrow('[ExoJS] must not be undefined');
  });

  test('returns the value when it is defined', () => {
    expect(assertDefined(42, 'unreachable')).toBe(42);
    expect(assertDefined('hello', 'unreachable')).toBe('hello');
    expect(assertDefined(0, 'unreachable')).toBe(0);
    expect(assertDefined(false, 'unreachable')).toBe(false);
  });

  test('throws an Error instance', () => {
    expect(() => assertDefined(null, 'err')).toThrow(Error);
  });

  test('falls back to a default message when none is given', () => {
    expect(() => assertDefined(null)).toThrow('[ExoJS] expected a defined value');
  });

  test('returns the value with no message argument', () => {
    expect(assertDefined(42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// invariant
// ---------------------------------------------------------------------------

describe('invariant', () => {
  test('does not throw when condition is true', () => {
    expect(() => invariant(true, 'should not throw')).not.toThrow();
  });

  test('throws with prefixed message when condition is false', () => {
    expect(() => invariant(false, 'test failure')).toThrow('[ExoJS] test failure');
  });

  test('throws an Error instance', () => {
    expect(() => invariant(false, 'err')).toThrow(Error);
  });

  test('falls back to a default message when none is given', () => {
    expect(() => invariant(false)).toThrow('[ExoJS] assertion failed');
  });
});

// ---------------------------------------------------------------------------
// warnOnce
// ---------------------------------------------------------------------------

describe('warnOnce', () => {
  test('calls console.warn on the first invocation for a key', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnce('test:first', 'hello');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[ExoJS] hello');
    spy.mockRestore();
  });

  test('does not call console.warn on a second invocation with the same key', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnce('test:once', 'msg');
    warnOnce('test:once', 'msg');
    warnOnce('test:once', 'msg');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('warns separately for distinct keys', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnce('key-a', 'A');
    warnOnce('key-b', 'B');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  test('_resetWarnOnce allows a key to warn again', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnce('test:reset', 'before');
    _resetWarnOnce();
    warnOnce('test:reset', 'after');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
