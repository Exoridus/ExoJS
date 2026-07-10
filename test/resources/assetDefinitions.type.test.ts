import { describe, expectTypeOf, it } from 'vitest';

import type { Sound } from '#audio/Sound';
import type { Texture } from '#rendering/texture/Texture';
import type { KindByPath, LeafForPath } from '#resources/AssetDefinitions';
import type { AssetRef } from '#resources/AssetRef';

describe('KindByPath / LeafForPath', () => {
  it('maps a png path to texture kind + Texture leaf', () => {
    expectTypeOf<KindByPath<'a/b.png'>>().toEqualTypeOf<'texture'>();
    expectTypeOf<LeafForPath<'a/b.png'>>().toEqualTypeOf<Texture>();
  });
  it('maps an ogg path to Sound leaf', () => {
    expectTypeOf<LeafForPath<'sfx/boom.ogg'>>().toEqualTypeOf<Sound>();
  });
  it('maps a json path to AssetRef leaf (value kind)', () => {
    expectTypeOf<LeafForPath<'levels/1.json'>>().toEqualTypeOf<AssetRef<unknown>>();
  });
  it('resolves an unregistered suffix to never / unknown', () => {
    expectTypeOf<KindByPath<'x.zzz'>>().toEqualTypeOf<never>();
    expectTypeOf<LeafForPath<'x.zzz'>>().toEqualTypeOf<unknown>();
  });
});
