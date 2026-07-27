// Type contract for `Assets.compose()` / `Assets.extend()`: a conflict-free
// composition types like an ordinary catalog, while a duplicate key resolves to
// a diagnostic OBJECT type naming the offending key(s) instead of collapsing to
// `never` — and, unlike a message string, matching no loader input.
// Compiled by `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { type AnyAssets, Assets, type Loader, type Texture } from '@codexo/exojs';

import type { CatalogResourceLeaf, CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Mirrors the (deliberately non-exported) diagnostic type in src/resources/Assets.ts.
interface Conflict<K extends string> {
  readonly _assetsComposeError: `Assets.compose(): duplicate catalog key "${K}" — two catalogs define it, use Assets.extend() to override it deliberately.`;
  readonly _conflictingKeys: K;
}

const shared = Assets.from({ logo: 'sprites/logo.png', config: 'game.json' });
const forest = Assets.from({ tree: 'sprites/tree.png' });

// --- conflict-free composition: every key keeps its leaf type ---------------

const composed = Assets.compose(shared, forest);

type _ComposedLogo = Expect<Equal<typeof composed.logo, CatalogResourceLeaf<Texture>>>;
type _ComposedConfig = Expect<Equal<typeof composed.config, CatalogValueLeaf<unknown>>>;
type _ComposedTree = Expect<Equal<typeof composed.tree, CatalogResourceLeaf<Texture>>>;
type _ComposedEntries = Expect<Equal<(typeof composed.entries)['tree'], CatalogResourceLeaf<Texture>>>;

declare const loader: Loader;

// --- diamond: the same catalog reaching the composition twice ---------------

const left = Assets.compose(shared, forest);
const right = Assets.compose(shared, Assets.from({ rock: 'sprites/rock.png' }));
const diamond = Assets.compose(left, right);

type _DiamondLogo = Expect<Equal<typeof diamond.logo, CatalogResourceLeaf<Texture>>>;
type _DiamondRock = Expect<Equal<typeof diamond.rock, CatalogResourceLeaf<Texture>>>;

// --- conflicts --------------------------------------------------------------

const other = Assets.from({ logo: 'sprites/other.png' });
const conflicted = Assets.compose(shared, other);

type _Conflicted = Expect<Equal<typeof conflicted, Conflict<'logo'>>>;
// The single offending key shows up in the diagnostic.
type _ConflictedKey = Expect<Equal<(typeof conflicted)['_conflictingKeys'], 'logo'>>;

// A conflict is a diagnostic, not a value the engine accepts anywhere: not
// `never` (which would erase the explanation), not a string (which the loader's
// bare-path overloads take), and not a catalog.
type _ConflictedNotNever = Expect<Equal<[typeof conflicted] extends [never] ? true : false, false>>;
type _ConflictedNotString = Expect<Equal<typeof conflicted extends string ? true : false, false>>;
type _ConflictedNotCatalog = Expect<Equal<typeof conflicted extends AnyAssets ? true : false, false>>;

// @ts-expect-error — a conflicting composition is a diagnostic type, not a catalog.
loader.load(conflicted);
// @ts-expect-error — and it is no readable catalog either.
loader.get(conflicted);

const twoOff = Assets.from({ logo: 'sprites/other.png', config: 'other.json' });
const multiConflicted = Assets.compose(shared, twoOff);

// Several duplicates keep the FULL union of keys — no collapse to one key.
type _MultiConflicted = Expect<Equal<typeof multiConflicted, Conflict<'logo' | 'config'>>>;
type _MultiConflictedKeys = Expect<Equal<(typeof multiConflicted)['_conflictingKeys'], 'logo' | 'config'>>;

// @ts-expect-error — a multi-key conflict is rejected at the use site just the same.
loader.load(multiConflicted);

// --- extend -----------------------------------------------------------------

const derived = Assets.extend(shared, { tree: 'sprites/tree.png', config: 'sprites/config.png' });

type _DerivedKept = Expect<Equal<typeof derived.logo, CatalogResourceLeaf<Texture>>>;
type _DerivedAdded = Expect<Equal<typeof derived.tree, CatalogResourceLeaf<Texture>>>;
// A deliberate override re-types the key: `config` was an AssetRef, now a Texture.
type _DerivedOverridden = Expect<Equal<typeof derived.config, CatalogResourceLeaf<Texture>>>;

export type {
  _ComposedConfig,
  _ComposedEntries,
  _ComposedLogo,
  _ComposedTree,
  _Conflicted,
  _ConflictedKey,
  _ConflictedNotCatalog,
  _ConflictedNotNever,
  _ConflictedNotString,
  _DerivedAdded,
  _DerivedKept,
  _DerivedOverridden,
  _DiamondLogo,
  _DiamondRock,
  _MultiConflicted,
  _MultiConflictedKeys,
};
