import type { Asset } from '@codexo/exojs';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { LdtkMap } from '../src/LdtkMap';

// `LdtkMap.of(...)` is the annotation-descriptor load path:
// `loader.load(LdtkMap.of('world.ldtk'))`. It builds a typed `Asset<LdtkMap>`
// carrying the `ldtkMap` kind (a bare `'world.ldtk'` string also resolves, via
// the extension binding).
describe('LdtkMap.of annotation static', () => {
  it('carries the ldtkMap kind + source', () => {
    const a = LdtkMap.of('world.ldtk');
    expect(a.type).toBe('ldtkMap');
    expect(a.source).toBe('world.ldtk');
  });

  it('is typed as Asset<LdtkMap>', () => {
    expectTypeOf(LdtkMap.of('world.ldtk')).toEqualTypeOf<Asset<LdtkMap>>();
  });
});
