import { describe, expectTypeOf, it } from 'vitest';

import type { TiledLoadOptions } from '../src/tiledOptions';

// Type-level contract for the Tiled load options surface. These assertions are
// verified by the package typecheck (the `@ts-expect-error` lines fail the build
// if the rejected shapes ever start compiling again).

describe('TiledLoadOptions typing', () => {
  it('exposes only an optional `format` hint, fixed to "tiled"', () => {
    expectTypeOf<TiledLoadOptions['format']>().toEqualTypeOf<'tiled' | undefined>();
    // The whole options object is assignable from an empty object (all optional).
    expectTypeOf<Record<string, never>>().toMatchTypeOf<TiledLoadOptions>();
  });

  it('compiles with no options, empty options, and the explicit format hint', () => {
    const omitted: TiledLoadOptions | undefined = undefined;
    const empty: TiledLoadOptions = {};
    const hinted: TiledLoadOptions = { format: 'tiled' };
    void omitted;
    void empty;
    void hinted;
  });

  it('rejects a foreign format and the removed `strict` option', () => {
    // @ts-expect-error — only 'tiled' is an accepted format (no 'ldtk' fall-through)
    const foreign: TiledLoadOptions = { format: 'ldtk' };
    // @ts-expect-error — `strict` was removed; Tiled parsing is unconditionally strict
    const strict: TiledLoadOptions = { strict: false };
    void foreign;
    void strict;
  });
});
