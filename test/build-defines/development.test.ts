/**
 * Development/test-mode runtime verification.
 *
 * In tests, __DEV__ is always replaced with `true` by Vitest's `define`.
 * These tests verify that:
 *   - buildInfo.development === true
 *   - assertions execute and throw
 *   - invariant executes and throws unconditionally (always-on, not __DEV__-gated)
 *   - no ReferenceError for compile-time globals (they exist as literals)
 */
import { describe, expect, it } from 'vitest';

import { assert, assertDefined, invariant } from '../../src/core/dev';

describe('buildInfo in test/development mode', () => {
  it('buildInfo.development is true', async () => {
    const { buildInfo } = await import('../../src/core/BuildInfo');
    expect(buildInfo.development).toBe(true);
  });

  it('buildInfo.version is a string', async () => {
    const { buildInfo } = await import('../../src/core/BuildInfo');
    expect(typeof buildInfo.version).toBe('string');
    expect(buildInfo.version.length).toBeGreaterThan(0);
  });

  it('buildInfo.revision is a string', async () => {
    const { buildInfo } = await import('../../src/core/BuildInfo');
    expect(typeof buildInfo.revision).toBe('string');
    expect(buildInfo.revision.length).toBeGreaterThan(0);
  });

  it('buildInfo is frozen (immutable)', async () => {
    const { buildInfo } = await import('../../src/core/BuildInfo');
    expect(Object.isFrozen(buildInfo)).toBe(true);
    expect(() => {
      (buildInfo as Record<string, unknown>).version = 'hacked';
    }).toThrow();
  });
});

describe('assert() in development mode', () => {
  it('does not throw when condition is true', () => {
    expect(() => assert(true, 'should not throw')).not.toThrow();
  });

  it('throws [ExoJS] prefixed error when condition is false', () => {
    expect(() => assert(false, 'this failed')).toThrow('[ExoJS] this failed');
  });
});

describe('assertDefined() in development mode', () => {
  it('returns value when non-null/undefined', () => {
    expect(assertDefined('hello', 'msg')).toBe('hello');
    expect(assertDefined(0, 'msg')).toBe(0);
    expect(assertDefined(false, 'msg')).toBe(false);
  });

  it('throws when value is null', () => {
    expect(() => assertDefined(null, 'was null')).toThrow('[ExoJS] was null');
  });

  it('throws when value is undefined', () => {
    expect(() => assertDefined(undefined, 'was undefined')).toThrow('[ExoJS] was undefined');
  });
});

describe('invariant() in development mode', () => {
  it('is an always-on check, not gated by __DEV__', () => {
    expect(() => invariant(true, 'ok')).not.toThrow();
    expect(() => invariant(false, 'bad')).toThrow('[ExoJS] bad');
  });
});
