// The value-brand fix (asset-system v2 delta §4): `Asset.type<Config>('json', …)`
// must classify as `AssetRef<Config>` inside a catalog (not `Config`), and the
// resolved map from `load(catalog)` unwraps it back to `Config`. Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { Asset, type AssetRef, Assets, type Loader, type LoadingQueue, type Texture } from '@codexo/exojs';

import type { CatalogResourceLeaf, CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Config {
  readonly hp: number;
}

const catalog = Assets.from({
  ship: Asset.type('texture', 'ship.png'),
  config: Asset.type<Config>('json', 'config.json'),
});

// resource-kind descriptor → the resource leaf
type _ShipIsTexture = Expect<Equal<typeof catalog.ship, CatalogResourceLeaf<Texture>>>;

// value-kind descriptor with object value → AssetRef<Config> (NOT Config)
type _ConfigIsRef = Expect<Equal<typeof catalog.config, CatalogValueLeaf<Config>>>;

// `.value` is well-typed on the ref leaf
type _ConfigValue = Expect<Equal<typeof catalog.config.value, Config>>;

// resolved map from load(catalog) unwraps the ref to its value
declare const loader: Loader;
function loadIt() {
  return loader.load(catalog);
}
type LoadedMap = Awaited<ReturnType<typeof loadIt>>;
type _ConfigResolved = Expect<Equal<LoadedMap['config'], Config>>;
type _ShipResolved = Expect<Equal<LoadedMap['ship'], Texture>>;

// direct get(asset) honors the same brand — value → AssetRef<T>, resource → T
// (regression guard: the brand-blind `T extends object` overload typed object
// value kinds as the resource while runtime returned an AssetRef). Both come
// back as MATERIALIZED leaves: `get(Asset.type(...))` mints them via `createLeaf`,
// so the `_assetMeta` stamp — and with it single-leaf re-loadability — survives.
function getConfig() {
  return loader.get(Asset.type<Config>('json', 'config.json'));
}
function getShip() {
  return loader.get(Asset.type('texture', 'ship.png'));
}
type _GetConfigIsRef = Expect<Equal<ReturnType<typeof getConfig>, CatalogValueLeaf<Config>>>;
type _GetShipIsTexture = Expect<Equal<ReturnType<typeof getShip>, CatalogResourceLeaf<Texture>>>;

// The brand rides ON the payload type, so ordinary annotations keep compiling…
const configRef: AssetRef<Config> = getConfig();
const shipTexture: Texture = getShip();

// …and the leaf goes straight back into a single-leaf `load()`.
function loadGotConfig() {
  return loader.load(getConfig());
}
function loadGotShip() {
  return loader.load(getShip());
}
type _GotConfigLoads = Expect<Equal<ReturnType<typeof loadGotConfig>, LoadingQueue<Config>>>;
type _GotShipLoads = Expect<Equal<ReturnType<typeof loadGotShip>, LoadingQueue<Texture>>>;

void [configRef, shipTexture];

export type { _ConfigIsRef, _ConfigResolved, _ConfigValue, _GetConfigIsRef, _GetShipIsTexture, _GotConfigLoads, _GotShipLoads, _ShipIsTexture, _ShipResolved };
