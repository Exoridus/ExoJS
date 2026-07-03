import { assert, assertDefined, invariant } from '#core/dev';

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
    expect(() => invariant(false)).toThrow('[ExoJS] invariant violated');
  });

  test('is always-on: not gated by __DEV__, unlike assert/assertDefined', () => {
    // invariant has no __DEV__ branch at all — it throws unconditionally in
    // every build, including production. There's nothing to toggle in a test
    // environment (vitest always sets __DEV__ = true), so this just pins the
    // always-on contract: the condition alone determines the outcome.
    expect(() => invariant(1 + 1 === 2, 'math is broken')).not.toThrow();
    expect(() => invariant(1 + 1 === 3, 'math is broken')).toThrow('[ExoJS] math is broken');
  });
});
