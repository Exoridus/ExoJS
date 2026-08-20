import '#assets/coreAssetBindings';

import { describe, expectTypeOf, it } from 'vitest';

import { type AssetRef } from '#assets/AssetRef';
import { type AnyAssets, Assets } from '#assets/Assets';
import type { Loader } from '#assets/Loader';
import type { Texture } from '#rendering/texture/Texture';

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

  // The `strict: false` counterpart lives in test/type-tests/assets-compose.type-test.ts;
  // these run under the engine's own strict config.
  it('types a conflict as a diagnostic no loader input accepts', () => {
    const other = Assets.from({ ship: 'z.png' });
    // Type-only: a conflicting composition THROWS at runtime, so the call is
    // never made - only its return type is inspected.
    const compose = () => Assets.compose(shared, other);
    type Conflicted = ReturnType<typeof compose>;

    // Not `never` (which would erase the explanation), not a string (which the
    // loader's bare-path overloads take), and not a catalog.
    expectTypeOf<[Conflicted] extends [never] ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<Conflicted extends string ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<Conflicted extends AnyAssets ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<Conflicted['_conflictingKeys']>().toEqualTypeOf<'ship'>();

    const load = (loader: Loader, conflicted: Conflicted) =>
      // @ts-expect-error - a conflicting composition is not a loader input.
      loader.load(conflicted);
    const get = (loader: Loader, conflicted: Conflicted) =>
      // @ts-expect-error - nor a readable catalog.
      loader.get(conflicted);

    expectTypeOf(load).toBeFunction();
    expectTypeOf(get).toBeFunction();
  });

  it('keeps the full key union when several keys collide', () => {
    const twoOff = Assets.from({ ship: 'z.png', level: 'z.json' });
    const compose = () => Assets.compose(shared, twoOff);

    expectTypeOf<ReturnType<typeof compose>['_conflictingKeys']>().toEqualTypeOf<'ship' | 'level'>();
  });

  it('adds and deliberately re-types keys via extend', () => {
    const derived = Assets.extend(shared, { tree: 'c.png', level: 'd.png' });

    expectTypeOf(derived.ship).toEqualTypeOf<Texture>();
    expectTypeOf(derived.tree).toEqualTypeOf<Texture>();
    expectTypeOf(derived.level).toEqualTypeOf<Texture>();
  });
});
