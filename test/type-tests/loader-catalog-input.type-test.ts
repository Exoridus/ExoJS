// Type contract for passing a MATERIALIZED `Assets` catalog to
// `Loader.load()` / `SceneLoader.load()`.
//
// The catalog overloads used to be keyed on `Record<string, AssetInput>`, which
// covers explicit configs and `Asset` descriptors but NOT the bare path strings
// a catalog definition may be written with - so `loader.load(Assets.from({ ship:
// 'ship.png' }))` matched no overload at all. They are keyed on
// `Record<string, CatalogEntry>` now: the loader consumes already materialized
// leaves and must not re-validate the definition entries.
//
// `pnpm typecheck:type-tests` compiles this file under all three lanes:
// `tsconfig.type-tests.json` (the example project's settings),
// `tsconfig.type-tests-strict.json` (the engine's own profile -
// `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`)
// and `tsconfig.type-tests.json` again with `--strictNullChecks false` on the
// command line. Every assertion below must hold identically in all three.

import { Asset, Assets, type Loader, type Scene, type Texture } from '@codexo/exojs';

import { LoadPriority } from '#assets/Loader';

import type { CatalogResourceLeaf, CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * Assertion as an EXPRESSION rather than a local type alias: the engine's strict
 * profile enables `noUnusedLocals`, under which a `type _X = Expect<…>` inside a
 * function body is an error.
 */
declare function expectType<_T extends true>(): void;

interface LevelData {
  readonly width: number;
  readonly height: number;
}

declare const loader: Loader;
declare const scene: Scene;

// --- catalogs ---------------------------------------------------------------

// The minimal repro: a catalog defined with bare paths only.
const bare = Assets.from({
  player: 'sprites/player.png',
  config: 'data/config.json',
});

const explicit = Assets.from({
  player: Asset.type('texture', 'sprites/player.png', { mimeType: 'image/png' }),
  // A value descriptor with an explicit payload annotation keeps that payload.
  config: Asset.type<LevelData>('json', 'data/config.json'),
});

// Bare paths and explicit descriptors/configs side by side.
const mixed = Assets.from({
  player: 'sprites/player.png',
  raw: { type: 'json', source: 'data/raw.json' },
  level: Asset.type<LevelData>('json', 'data/level.json'),
});

const forest = Assets.from({ tree: 'sprites/tree.png', trees: 'data/trees.json' });
const composed = Assets.compose(bare, forest);
const extended = Assets.extend(bare, { enemy: 'sprites/enemy.png' });

// The catalog LEAVES are unchanged by this fix - asserted so a regression in the
// loaded-map inference can't be mistaken for a leaf-inference regression.
type _BareLeafPlayer = Expect<Equal<typeof bare.player, CatalogResourceLeaf<Texture>>>;
type _BareLeafConfig = Expect<Equal<typeof bare.config, CatalogValueLeaf<unknown>>>;
type _ExplicitLeafConfig = Expect<Equal<typeof explicit.config, CatalogValueLeaf<LevelData>>>;

// --- loading them -----------------------------------------------------------

export async function loads(): Promise<void> {
  // The LOADED map, exactly: a resource type resolves to its resource, a value
  // type to its decoded payload (`unknown` for bare-path JSON) rather than to
  // the `AssetRef` wrapper the catalog property holds.
  const bareResult = await loader.load(bare);
  expectType<Equal<typeof bareResult, { readonly player: Texture; readonly config: unknown }>>();

  const explicitResult = await loader.load(explicit);
  expectType<Equal<typeof explicitResult, { readonly player: Texture; readonly config: LevelData }>>();

  const mixedResult = await loader.load(mixed, { priority: LoadPriority.Background });
  expectType<Equal<typeof mixedResult.player, Texture>>();
  expectType<Equal<typeof mixedResult.raw, unknown>>();
  expectType<Equal<typeof mixedResult.level, LevelData>>();

  // A composed catalog keeps the FULL result map of every input.
  const composedResult = await loader.load(composed);
  expectType<Equal<typeof composedResult.player, Texture>>();
  expectType<Equal<typeof composedResult.config, unknown>>();
  expectType<Equal<typeof composedResult.tree, Texture>>();
  expectType<Equal<typeof composedResult.trees, unknown>>();

  // An extended catalog keeps the base keys and adds the new one.
  const extendedResult = await loader.load(extended, { priority: LoadPriority.Background });
  expectType<Equal<typeof extendedResult.player, Texture>>();
  expectType<Equal<typeof extendedResult.config, unknown>>();
  expectType<Equal<typeof extendedResult.enemy, Texture>>();

  // `SceneLoader` mirrors the same corrected surface, `LoadOptions` included.
  const sceneResult = await scene.loader.load(bare);
  expectType<Equal<typeof sceneResult, { readonly player: Texture; readonly config: unknown }>>();

  const sceneComposed = await scene.loader.load(composed, { priority: LoadPriority.Background });
  expectType<Equal<typeof sceneComposed.tree, Texture>>();

  // `get()`/`release()` take the very same catalogs - same root cause, same fix.
  const held = loader.get(bare);
  expectType<Equal<typeof held.player, CatalogResourceLeaf<Texture>>>();
  loader.createScope().release(bare);
  scene.loader.get(composed);
}

// --- the neighbouring overloads are untouched -------------------------------

export async function neighbours(): Promise<void> {
  // Single descriptor.
  const single = await loader.load(Asset.type('texture', 'sprites/one.png'));
  expectType<Equal<typeof single, Texture>>();

  // Single value leaf (an `AssetRef` catalog property) resolves to its payload.
  const leafValue = await loader.load(mixed.level);
  expectType<Equal<typeof leafValue, LevelData>>();

  // Single handle-hybrid leaf. Full coverage of the brand-matched leaf overloads
  // lives in `loader-catalog-leaf.type-test.ts`.
  const leafHandle = await loader.load(bare.player);
  expectType<Equal<typeof leafHandle, Texture>>();

  // Bare path.
  const path = await loader.load('sprites/solo.png');
  expectType<Equal<typeof path, Texture>>();
}

// --- negative: a plain record is not a catalog ------------------------------

declare const plainRecord: { player: 'sprites/player.png'; config: 'data/config.json' };

export function negatives(): void {
  // @ts-expect-error - a definition RECORD is not a materialized `Assets`
  // catalog; the catalog overload takes `Assets.from(...)` output, not the
  // record it was built from.
  loader.load(plainRecord);

  // @ts-expect-error - and the scene-scoped mirror rejects it just the same.
  scene.loader.load(plainRecord);

  // @ts-expect-error - an arbitrary object matches no loader input either.
  loader.load({ nope: 1 });
}

export type { _BareLeafConfig, _BareLeafPlayer, _ExplicitLeafConfig };
