// Type contract for the bare-path suffixes claimed by shipped extension
// packages. `Loader.load(path)`/`Loader.get(path)` infer through
// `ExtensionKindMap` (suffix → asset type) — NOT the legacy `ExtensionTypeMap`
// (suffix → resource), which no longer drives any call signature. A package that
// augments the wrong map still compiles, but leaves its documented bare-path
// call resolving to `never` for consumers, so these assertions pin the map that
// actually feeds inference. Compiled by `tsconfig.type-tests.json` via
// `pnpm typecheck:type-tests` (package `test/` dirs are excluded from their own
// `typecheck`, so this is the gate that has teeth).

// Side-effect imports: the `declare module '@codexo/exojs'` augmentations ride
// on each package's public surface.
import '@codexo/exojs-ldtk';
import '@codexo/exojs-tiled';

import type { KindByPath, Loader, LoadingQueue } from '@codexo/exojs';
import type { LdtkMap } from '@codexo/exojs-ldtk';
import type { TileMap } from '@codexo/exojs-tilemap';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const loader: Loader;

// ── @codexo/exojs-tiled — the `tmj` suffix ───────────────────────────────────
type _TmjKind = Expect<Equal<KindByPath<'world.tmj'>, 'tileMap'>>;
type _TmjNested = Expect<Equal<KindByPath<'levels/forest.tmj'>, 'tileMap'>>;
type _TmjQuery = Expect<Equal<KindByPath<'world.tmj?v=2'>, 'tileMap'>>;
// The augmentation must not leak onto a neighbouring, unclaimed suffix.
type _TmxUnclaimed = Expect<Equal<KindByPath<'world.tmx'>, never>>;

// The documented shorthand must actually accept the path (a `never` parameter
// would reject it) and resolve to the runtime map type.
const tiledQueue = loader.load('world.tmj');
type _TiledLoadResolves = Expect<Equal<typeof tiledQueue, LoadingQueue<TileMap>>>;

// ── @codexo/exojs-ldtk — the `ldtk` suffix ───────────────────────────────────
type _LdtkKind = Expect<Equal<KindByPath<'world.ldtk'>, 'ldtkMap'>>;
type _LdtkNested = Expect<Equal<KindByPath<'https://example.com/levels/world.ldtk'>, 'ldtkMap'>>;

const ldtkQueue = loader.load('levels/world.ldtk');
type _LdtkLoadResolves = Expect<Equal<typeof ldtkQueue, LoadingQueue<LdtkMap>>>;
