// Type contract for the SINGLE-LEAF `Loader.load()` / `Loader.get()` overloads
// (and their `SceneLoader` mirrors).
//
// Those overloads used to be keyed on `ResourceAssetObject`, i.e.
// `Extract<AssetDefinitions[keyof AssetDefinitions]['resource'], object>` - but
// `json`'s `resource: unknown` swallows the indexed union it is extracted from,
// so the whole thing collapsed to `Extract<unknown, object>` = `never` and
// `loader.load(bag.player)` matched no overload at all, while the runtime
// accepted it happily.
//
// The replacement is not a hand-rolled union of object-ish resources: that would
// wave through every raw `Texture`, plus non-leaf resources (`AudioStream`,
// `Video`, `BmFont`, `FontFace`, `HTMLImageElement`) the runtime rejects. It
// mirrors the runtime identity instead - the `_assetMeta` stamp `createLeaf`
// puts on every materialized leaf - as a type-level brand, so the accepted set
// is exactly the set `_loadClaimed`'s meta-stamped-leaf branch handles.
//
// `pnpm typecheck:type-tests` compiles this file under all three lanes: the
// example project's settings, the engine's own strict profile and
// `strictNullChecks: false`.

import {
  Asset,
  AssetRef,
  Assets,
  type AudioStream,
  type BmFont,
  type Loader,
  type LoadingQueue,
  type Scene,
  type Sound,
  type Texture,
  type Video,
} from '@codexo/exojs';

import { LoadPriority } from '#assets/Loader';

import type { CatalogResourceLeaf, CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
declare function expectType<_T extends true>(): void;

declare const loader: Loader;
declare const scene: Scene;

// --- a custom seamless RESOURCE type and a custom VALUE type ----------------
//
// The brand must not lean on a hardcoded `'texture' | 'sound'` union, nor on
// `ExtensionKindMap` alone: a seamless package type can be named explicitly in a
// catalog config without ever claiming a file suffix. Both shapes are declared
// here the way a package augments the engine.

declare class SpriteAtlas {
  public readonly frames: readonly string[];
}

interface AtlasMetrics {
  readonly count: number;
}

declare module '@codexo/exojs' {
  interface AssetDefinitions {
    // A seamless resource type: no `isValue`, so its leaf heals in place.
    spriteAtlas: { resource: SpriteAtlas; config: { source: string } };
    // A value type: `isValue: true`, so its leaf is a deferred ref.
    atlasMetrics: { resource: AtlasMetrics; config: { source: string }; isValue: true };
  }
}

// --- the catalog ------------------------------------------------------------

const bag = Assets.from({
  player: 'player.png',
  jump: 'jump.wav',
  config: 'config.json',
  // Explicit configs - no file suffix involved for the custom types.
  atlas: Asset.type('spriteAtlas', 'atlases/hero'),
  metrics: Asset.type('atlasMetrics', 'atlases/hero.meta'),
});

// A branded leaf stays ordinarily usable: the brand rides ON the resource, so
// every existing annotation keeps compiling.
const texture: Texture = bag.player;
const sound: Sound = bag.jump;
const config: AssetRef<unknown> = bag.config;
const atlas: SpriteAtlas = bag.atlas;
const metrics: AssetRef<AtlasMetrics> = bag.metrics;

// ...and it is exactly the branded leaf, not the bare resource.
expectType<Equal<typeof bag.player, CatalogResourceLeaf<Texture>>>();
expectType<Equal<typeof bag.jump, CatalogResourceLeaf<Sound>>>();
expectType<Equal<typeof bag.config, CatalogValueLeaf<unknown>>>();
expectType<Equal<typeof bag.atlas, CatalogResourceLeaf<SpriteAtlas>>>();
expectType<Equal<typeof bag.metrics, CatalogValueLeaf<AtlasMetrics>>>();

// --- load(leaf) / get(leaf) -------------------------------------------------

export async function leafLoads(): Promise<void> {
  const textureQueue = loader.load(bag.player);
  expectType<Equal<typeof textureQueue, LoadingQueue<Texture>>>();
  expectType<Equal<Awaited<typeof textureQueue>, Texture>>();

  const soundQueue = loader.load(bag.jump, { priority: LoadPriority.Background });
  expectType<Equal<Awaited<typeof soundQueue>, Sound>>();

  // A value leaf resolves to its DECODED payload, not to the ref.
  const configQueue = loader.load(bag.config);
  expectType<Equal<typeof configQueue, LoadingQueue<unknown>>>();
  expectType<Equal<Awaited<typeof configQueue>, unknown>>();

  const atlasQueue = loader.load(bag.atlas);
  expectType<Equal<Awaited<typeof atlasQueue>, SpriteAtlas>>();

  const metricsQueue = loader.load(bag.metrics, { priority: LoadPriority.Background });
  expectType<Equal<Awaited<typeof metricsQueue>, AtlasMetrics>>();

  // `get(leaf)` adopts and returns THE SAME leaf - brand included, because the
  // runtime hands back the very stamped object it was given. A resource leaf
  // stays its resource, a value leaf the ref itself (its payload arrives on the
  // ref); both keep the stamp that makes them re-loadable below.
  expectType<Equal<ReturnType<typeof getTexture>, CatalogResourceLeaf<Texture>>>();
  expectType<Equal<ReturnType<typeof getSound>, CatalogResourceLeaf<Sound>>>();
  expectType<Equal<ReturnType<typeof getAtlas>, CatalogResourceLeaf<SpriteAtlas>>>();
  expectType<Equal<ReturnType<typeof getConfig>, CatalogValueLeaf<unknown>>>();
  expectType<Equal<ReturnType<typeof getMetrics>, CatalogValueLeaf<AtlasMetrics>>>();

  // A branded `get()` result stays ordinarily usable...
  const gotTexture: Texture = loader.get(bag.player);
  const gotSound: Sound = loader.get(bag.jump);
  const gotMetrics: AssetRef<AtlasMetrics> = loader.get(bag.metrics);
  void [gotTexture, gotSound, gotMetrics];

  // ...and round-trips back into a single-leaf `load()` with exact inference.
  const roundTripTexture = loader.load(loader.get(bag.player));
  expectType<Equal<typeof roundTripTexture, LoadingQueue<Texture>>>();

  const roundTripConfig = loader.load(loader.get(bag.config));
  expectType<Equal<typeof roundTripConfig, LoadingQueue<unknown>>>();

  const roundTripMetrics = loader.load(loader.get(bag.metrics));
  expectType<Equal<typeof roundTripMetrics, LoadingQueue<AtlasMetrics>>>();
}

function getTexture() {
  return loader.get(bag.player);
}
function getSound() {
  return loader.get(bag.jump);
}
function getAtlas() {
  return loader.get(bag.atlas);
}
function getConfig() {
  return loader.get(bag.config);
}
function getMetrics() {
  return loader.get(bag.metrics);
}

// --- composed / extended catalogs hand out the same branded leaves ----------

const extra = Assets.from({ tree: 'tree.png', trees: 'trees.json' });
const composed = Assets.compose(bag, extra);
const extended = Assets.extend(bag, { enemy: 'enemy.png' });

export async function derivedLeaves(): Promise<void> {
  const composedLeaf = await loader.load(composed.tree);
  expectType<Equal<typeof composedLeaf, Texture>>();

  const composedValue = await loader.load(composed.trees);
  expectType<Equal<typeof composedValue, unknown>>();

  // A composition SHARES its inputs' leaves - the base key stays loadable too.
  const composedBase = await loader.load(composed.player);
  expectType<Equal<typeof composedBase, Texture>>();

  const extendedLeaf = await loader.load(extended.enemy);
  expectType<Equal<typeof extendedLeaf, Texture>>();

  const extendedKept = loader.get(extended.player);
  expectType<Equal<typeof extendedKept, CatalogResourceLeaf<Texture>>>();
}

// --- SceneLoader mirrors the same surface ----------------------------------

export async function sceneLeaves(): Promise<void> {
  const sceneTexture = await scene.loader.load(bag.player);
  expectType<Equal<typeof sceneTexture, Texture>>();

  const sceneValue = await scene.loader.load(bag.config, { priority: LoadPriority.Background });
  expectType<Equal<typeof sceneValue, unknown>>();

  const sceneAtlas = await scene.loader.load(bag.atlas);
  expectType<Equal<typeof sceneAtlas, SpriteAtlas>>();

  expectType<Equal<ReturnType<typeof sceneGetTexture>, CatalogResourceLeaf<Texture>>>();
  expectType<Equal<ReturnType<typeof sceneGetMetrics>, CatalogValueLeaf<AtlasMetrics>>>();

  const sceneRoundTrip = scene.loader.load(scene.loader.get(bag.player));
  expectType<Equal<typeof sceneRoundTrip, LoadingQueue<Texture>>>();

  const sceneValueRoundTrip = scene.loader.load(scene.loader.get(bag.metrics));
  expectType<Equal<typeof sceneValueRoundTrip, LoadingQueue<AtlasMetrics>>>();
}

function sceneGetTexture() {
  return scene.loader.get(bag.player);
}
function sceneGetMetrics() {
  return scene.loader.get(bag.metrics);
}

// --- get(descriptor) is branded too, and round-trips ------------------------
//
// The `Asset.type(...)` branch mints its leaf through `createLeaf`, so the
// returned handle carries the very same `_assetMeta` stamp a catalog leaf does.

export function descriptorLeaves(): void {
  const descriptorTexture = loader.get(Asset.type('texture', 'player.png'));
  expectType<Equal<typeof descriptorTexture, CatalogResourceLeaf<Texture>>>();

  const plainTexture: Texture = descriptorTexture;
  void plainTexture;

  const descriptorQueue = loader.load(descriptorTexture);
  expectType<Equal<typeof descriptorQueue, LoadingQueue<Texture>>>();

  const descriptorMetrics = loader.get(Asset.type('atlasMetrics', 'atlases/hero.meta'));
  expectType<Equal<typeof descriptorMetrics, CatalogValueLeaf<AtlasMetrics>>>();

  const plainRef: AssetRef<AtlasMetrics> = descriptorMetrics;
  void plainRef;

  const descriptorValueQueue = loader.load(descriptorMetrics);
  expectType<Equal<typeof descriptorValueQueue, LoadingQueue<AtlasMetrics>>>();

  // The scene-scoped mirror brands identically.
  const sceneDescriptorTexture = scene.loader.get(Asset.type('texture', 'player.png'));
  expectType<Equal<typeof sceneDescriptorTexture, CatalogResourceLeaf<Texture>>>();
  expectType<Equal<ReturnType<typeof sceneLoadDescriptorTexture>, LoadingQueue<Texture>>>();

  const sceneDescriptorMetrics = scene.loader.get(Asset.type('atlasMetrics', 'atlases/hero.meta'));
  expectType<Equal<typeof sceneDescriptorMetrics, CatalogValueLeaf<AtlasMetrics>>>();
  expectType<Equal<ReturnType<typeof sceneLoadDescriptorMetrics>, LoadingQueue<AtlasMetrics>>>();
}

function sceneLoadDescriptorTexture() {
  return scene.loader.load(scene.loader.get(Asset.type('texture', 'player.png')));
}
function sceneLoadDescriptorMetrics() {
  return scene.loader.load(scene.loader.get(Asset.type('atlasMetrics', 'atlases/hero.meta')));
}

// --- negative: only a MATERIALIZED leaf is a leaf ---------------------------

declare const rawTexture: Texture;
declare const rawSound: Sound;
declare const rawRef: AssetRef<unknown>;
declare const rawAtlas: SpriteAtlas;
// Non-leaf resource types: these have no seamless adapter, so the runtime never
// hands them out as a catalog leaf either.
declare const audioStream: AudioStream;
declare const video: Video;
declare const bmFont: BmFont;
declare const image: HTMLImageElement;
declare const fontFace: FontFace;

export function negatives(): void {
  // @ts-expect-error - a raw resource carries no `_assetMeta` stamp.
  loader.load(rawTexture);
  // @ts-expect-error - ...and `get` rejects it for the same reason.
  loader.get(rawTexture);
  // @ts-expect-error - raw Sound is not a leaf either.
  loader.load(rawSound);
  // @ts-expect-error - a bare `AssetRef` is not a materialized value leaf.
  loader.load(rawRef);
  // @ts-expect-error - nor is a raw instance of a CUSTOM seamless resource.
  loader.load(rawAtlas);

  // Non-leaf resource types must not sneak in through the leaf overloads.
  // @ts-expect-error - AudioStream is not a catalog leaf.
  loader.load(audioStream);
  // @ts-expect-error - Video is not a catalog leaf.
  loader.load(video);
  // @ts-expect-error - BmFont is not a catalog leaf.
  loader.load(bmFont);
  // @ts-expect-error - HTMLImageElement is not a catalog leaf.
  loader.load(image);
  // @ts-expect-error - FontFace is not a catalog leaf.
  loader.load(fontFace);

  // The scene-scoped mirror enforces the same contract.
  // @ts-expect-error - raw resource, scene loader.
  scene.loader.load(rawTexture);
  // @ts-expect-error - raw resource, scene loader `get`.
  scene.loader.get(rawTexture);
}

// --- negative: bare-path `get()` stays UNBRANDED -----------------------------
//
// The deliberate asymmetry: a bare path resolves through the source-keyed dedup
// rather than `createLeaf`, so the handle it returns carries no `_assetMeta`
// stamp at runtime - and must therefore not be re-loadable as a single leaf.

export function barePathStaysUnbranded(): void {
  const bareTexture = loader.get('player.png');
  expectType<Equal<typeof bareTexture, Texture>>();

  const bareRef = loader.get('config.json');
  expectType<Equal<typeof bareRef, AssetRef<unknown>>>();

  // @ts-expect-error - an unstamped bare-path handle is not a single leaf.
  loader.load(bareTexture);
  // @ts-expect-error - ...nor is the bare-path AssetRef.
  loader.load(bareRef);
  // @ts-expect-error - inline form, same contract.
  loader.load(loader.get('player.png'));

  const sceneBareTexture = scene.loader.get('player.png');
  expectType<Equal<typeof sceneBareTexture, Texture>>();
  // @ts-expect-error - the scene mirror keeps the asymmetry.
  scene.loader.load(sceneBareTexture);
}

void [texture, sound, config, atlas, metrics, new AssetRef<unknown>()];
