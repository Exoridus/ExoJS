import '#resources/coreAssetBindings';

import { describe, expectTypeOf, it } from 'vitest';

import type { Texture } from '#rendering/texture/Texture';
import { type AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';
import type { Loader } from '#resources/Loader';

describe('Assets.from types', () => {
  it('infers Texture + AssetRef leaves from bare strings', () => {
    const a = Assets.from({ ship: 'a.png', level: 'b.json' });
    expectTypeOf(a.ship).toEqualTypeOf<Texture>();
    expectTypeOf(a.level).toEqualTypeOf<AssetRef<unknown>>();
  });
});

describe('Assets.compose / Assets.extend types', () => {
  const shared = Assets.from({ ship: 'a.png', level: 'b.json' });
  const forest = Assets.from({ tree: 'c.png' });

  it('types a conflict-free composition as an ordinary catalog', () => {
    const composed = Assets.compose(shared, forest);

    expectTypeOf(composed.ship).toEqualTypeOf<Texture>();
    expectTypeOf(composed.level).toEqualTypeOf<AssetRef<unknown>>();
    expectTypeOf(composed.tree).toEqualTypeOf<Texture>();
    expectTypeOf(composed.entries.tree).toEqualTypeOf<Texture>();
  });

  it('loads a composed catalog with the same resolved-map typing as a plain one', () => {
    const composed = Assets.compose(shared, forest);
    // Type-only: `expectTypeOf` never invokes, so no loader bindings are needed.
    const loadIt = (loader: Loader) => loader.load(composed);

    expectTypeOf(loadIt).returns.resolves.toEqualTypeOf<{ ship: Texture; level: unknown; tree: Texture }>();
  });

  it('adds and deliberately re-types keys via extend', () => {
    const derived = Assets.extend(shared, { tree: 'c.png', level: 'd.png' });

    expectTypeOf(derived.ship).toEqualTypeOf<Texture>();
    expectTypeOf(derived.tree).toEqualTypeOf<Texture>();
    expectTypeOf(derived.level).toEqualTypeOf<Texture>();
  });
});
