// Type contract for `Assets.compose()` / `Assets.extend()`: a conflict-free
// composition types like an ordinary catalog, while a duplicate key resolves to
// a message type naming the offending key(s) instead of collapsing to `never`.
// Compiled by `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { type AssetRef, Assets, type Loader, type Texture } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Conflict<K extends string> = `Assets.compose(): duplicate catalog key "${K}" — two catalogs define it, use Assets.extend() to override it deliberately.`;

const shared = Assets.from({ logo: 'sprites/logo.png', config: 'game.json' });
const forest = Assets.from({ tree: 'sprites/tree.png' });

// --- conflict-free composition: every key keeps its leaf type ---------------

const composed = Assets.compose(shared, forest);

type _ComposedLogo = Expect<Equal<typeof composed.logo, Texture>>;
type _ComposedConfig = Expect<Equal<typeof composed.config, AssetRef<unknown>>>;
type _ComposedTree = Expect<Equal<typeof composed.tree, Texture>>;
type _ComposedEntries = Expect<Equal<(typeof composed.entries)['tree'], Texture>>;

declare const loader: Loader;

// --- diamond: the same catalog reaching the composition twice ---------------

const left = Assets.compose(shared, forest);
const right = Assets.compose(shared, Assets.from({ rock: 'sprites/rock.png' }));
const diamond = Assets.compose(left, right);

type _DiamondLogo = Expect<Equal<typeof diamond.logo, Texture>>;
type _DiamondRock = Expect<Equal<typeof diamond.rock, Texture>>;

// --- conflicts --------------------------------------------------------------

const other = Assets.from({ logo: 'sprites/other.png' });
const conflicted = Assets.compose(shared, other);

type _Conflicted = Expect<Equal<typeof conflicted, Conflict<'logo'>>>;

// @ts-expect-error — a conflicting composition is a message type, not a catalog.
loader.load(conflicted);

const twoOff = Assets.from({ logo: 'sprites/other.png', config: 'other.json' });
const multiConflicted = Assets.compose(shared, twoOff);

type _MultiConflicted = Expect<Equal<typeof multiConflicted, Conflict<'logo'> | Conflict<'config'>>>;

// --- extend -----------------------------------------------------------------

const derived = Assets.extend(shared, { tree: 'sprites/tree.png', config: 'sprites/config.png' });

type _DerivedKept = Expect<Equal<typeof derived.logo, Texture>>;
type _DerivedAdded = Expect<Equal<typeof derived.tree, Texture>>;
// A deliberate override re-types the key: `config` was an AssetRef, now a Texture.
type _DerivedOverridden = Expect<Equal<typeof derived.config, Texture>>;

export type {
  _ComposedConfig,
  _ComposedEntries,
  _ComposedLogo,
  _ComposedTree,
  _Conflicted,
  _DerivedAdded,
  _DerivedKept,
  _DerivedOverridden,
  _DiamondLogo,
  _DiamondRock,
  _MultiConflicted,
};
