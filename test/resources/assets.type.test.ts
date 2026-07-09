import '#resources/seamless';

import { describe, expectTypeOf, it } from 'vitest';

import type { Texture } from '#rendering/texture/Texture';
import { type AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';

describe('Assets.from types', () => {
  it('infers Texture + AssetRef leaves from bare strings', () => {
    const a = Assets.from({ ship: 'a.png', level: 'b.json' });
    expectTypeOf(a.ship).toEqualTypeOf<Texture>();
    expectTypeOf(a.level).toEqualTypeOf<AssetRef<unknown>>();
  });
});
