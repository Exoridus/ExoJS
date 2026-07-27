// Type contract for the bare-path suffixes claimed by shipped extension
// packages. `Loader.load(path)`/`Loader.get(path)` infer through
// `ExtensionKindMap` (suffix → asset type) — the sole bare-path inference map
// (suffix → resource), which no longer drives any call signature. A package that
// augments the wrong map still compiles, but leaves its documented bare-path
// call resolving to `never` for consumers, so these assertions pin the map that
// actually feeds inference. Compiled by `tsconfig.type-tests.json` via
// `pnpm typecheck:type-tests` (package `test/` dirs are excluded from their own
// `typecheck`, so this is the gate that has teeth).

// Side-effect imports: the `declare module '@codexo/exojs'` augmentations ride
// on each package's public surface.
import '@codexo/exojs-aseprite';
import '@codexo/exojs-ldtk';
import '@codexo/exojs-tiled';

import { Asset, type AssetRef, Assets, type KindByPath, type Loader, type LoadingQueue, type Texture } from '@codexo/exojs';
import type { AsepriteSheet } from '@codexo/exojs-aseprite';
import type { LdtkMap } from '@codexo/exojs-ldtk';
import type { TiledMap } from '@codexo/exojs-tiled';
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

// ── get() must agree with the RUNTIME leaf shape ─────────────────────────────
//
// `defineAsset` computes `isValue` at runtime as `isValue ?? seamless === undefined`,
// so a package binding that ships no seamless adapter hands out an `AssetRef`
// wrapper — never the bare resource. `LeafForPath` decides the same question
// from `ValueAssetKind`, which the package mirrors with `isValue: true` on its
// `AssetDefinitions` entry. If the two ever drift, `get(path)` type-checks as
// the unwrapped resource while returning an `AssetRef` at runtime, and
// `loader.get('world.tmj').someTileMapMethod()` compiles and then crashes.
const tiledLeaf = loader.get('world.tmj');
type _TiledGetIsRef = Expect<Equal<typeof tiledLeaf, AssetRef<TileMap>>>;

const ldtkLeaf = loader.get('levels/world.ldtk');
type _LdtkGetIsRef = Expect<Equal<typeof ldtkLeaf, AssetRef<LdtkMap>>>;

// The same contract on the descriptor path, which was already reachable before
// bare paths were (`Asset.type(...)` brands a value kind as `ValueAsset<T>`, and
// both `get(descriptor)` and a catalog leaf resolve it to `AssetRef<T>`).
const tiledFromDescriptor = loader.get(Asset.type('tiledMap', 'world.tmj'));
type _TiledDescriptorIsRef = Expect<Equal<typeof tiledFromDescriptor, AssetRef<TiledMap>>>;

const asepriteFromDescriptor = loader.get(Asset.type('asepriteSheet', 'hero.aseprite.json'));
type _AsepriteDescriptorIsRef = Expect<Equal<typeof asepriteFromDescriptor, AssetRef<AsepriteSheet>>>;

const catalog = Assets.from({ map: Asset.type('tileMap', 'world.tmj'), sheet: Asset.type('asepriteSheet', 'hero.aseprite.json') });
type _CatalogLeavesAreRefs = Expect<Equal<(typeof catalog)['map'], AssetRef<TileMap>>>;
type _CatalogSheetIsRef = Expect<Equal<(typeof catalog)['sheet'], AssetRef<AsepriteSheet>>>;

// A resource kind with a seamless adapter still resolves unwrapped — the marker
// must not turn every package kind into a ref.
const shipLeaf = loader.get('sprites/ship.png');
type _SeamlessStaysUnwrapped = Expect<Equal<typeof shipLeaf, Texture>>;
