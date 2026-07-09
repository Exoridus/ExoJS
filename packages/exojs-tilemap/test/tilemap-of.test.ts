import type { Asset } from '@codexo/exojs';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { TileMap } from '../src/TileMap';

// `TileMap.of(...)` is the annotation-descriptor load path for the runtime map:
// `loader.load(TileMap.of('world.tmj'))`. The concrete loader binding (and the
// `tileMap` asset kind) is provided by a format package such as
// `@codexo/exojs-tiled`; this package's own compilation cannot see that key, so
// `of` constructs the descriptor through a loosened constructor signature.
describe('TileMap.of annotation static', () => {
  it('carries the tileMap kind + source', () => {
    const a = TileMap.of('world.tmj');
    expect(a.kind).toBe('tileMap');
    expect(a.source).toBe('world.tmj');
  });

  it('is typed as Asset<TileMap>', () => {
    expectTypeOf(TileMap.of('world.tmj')).toEqualTypeOf<Asset<TileMap>>();
  });
});
