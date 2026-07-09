// The value-brand fix (asset-system v2 delta §4): `Asset.kind<Config>('json', …)`
// must classify as `AssetRef<Config>` inside a catalog (not `Config`), and the
// resolved map from `load(catalog)` unwraps it back to `Config`. Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { Asset, AssetRef, Assets, Loader, type Texture } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Config {
  readonly hp: number;
}

const catalog = Assets.from({
  ship: Asset.kind('texture', 'ship.png'),
  config: Asset.kind<Config>('json', 'config.json'),
});

// resource-kind descriptor → the resource leaf
type _ShipIsTexture = Expect<Equal<typeof catalog.ship, Texture>>;

// value-kind descriptor with object value → AssetRef<Config> (NOT Config)
type _ConfigIsRef = Expect<Equal<typeof catalog.config, AssetRef<Config>>>;

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

export type { _ConfigIsRef, _ConfigResolved, _ConfigValue, _ShipIsTexture, _ShipResolved };
