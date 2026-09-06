import { describe, expect, it } from 'vitest';

import { collectDeprecatedExportsFromSource } from '../../../packages/exojs-config/eslint/plugin/deprecatedApi.js';

describe('collectDeprecatedExportsFromSource', () => {
  it('finds nothing when no export carries @deprecated', () => {
    const source = `
/** Not deprecated. */
export const Fine = 1;
`;

    expect(collectDeprecatedExportsFromSource(source)).toEqual({});
  });

  it('reads a single-line @deprecated tag on an exported const', () => {
    const source = `
/**
 * Old thing.
 * @deprecated Use Foo instead.
 */
export const OldThing = 1;
`;

    expect(collectDeprecatedExportsFromSource(source)).toEqual({ OldThing: 'Use Foo instead.' });
  });

  it('joins a @deprecated tag that wraps multiple comment lines, stopping at the next tag', () => {
    const source = `
/**
 * @deprecated Use Bar instead. This will be removed
 * in a future release.
 * @see Bar
 */
export function OldFn() {}
`;

    expect(collectDeprecatedExportsFromSource(source)).toEqual({
      OldFn: 'Use Bar instead. This will be removed in a future release.',
    });
  });

  it('covers every export kind the engine public API uses', () => {
    const source = `
/** @deprecated Use NewClass. */
export class OldClass {}

/** @deprecated Use NewInterface. */
export interface OldInterface {}

/** @deprecated Use NewType. */
export type OldType = string;

/** @deprecated Use NewEnum. */
export enum OldEnum { A }
`;

    expect(collectDeprecatedExportsFromSource(source)).toEqual({
      OldClass: 'Use NewClass.',
      OldInterface: 'Use NewInterface.',
      OldType: 'Use NewType.',
      OldEnum: 'Use NewEnum.',
    });
  });

  it('only attributes the tag to an export the comment directly precedes', () => {
    const source = `
/**
 * @deprecated Not exported directly.
 */
const helper = 1;

export const Other = helper;
`;

    expect(collectDeprecatedExportsFromSource(source)).toEqual({});
  });

  it('records an empty reason for a bare @deprecated tag rather than dropping the entry', () => {
    const source = `
/**
 * @deprecated
 */
export const NoReason = 1;
`;

    expect(collectDeprecatedExportsFromSource(source)).toEqual({ NoReason: '' });
  });
});
