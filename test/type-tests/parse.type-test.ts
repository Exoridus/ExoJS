// The object-based `parse` form (asset-system v2 delta §4/§5): a value config
// with `parse` classifies as `AssetRef<R>` (R = parse's return type) in a
// catalog, and the resolved map from `load(catalog)` unwraps to R. Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { AssetRef, Assets, Loader } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Config {
  readonly hp: number;
}

const catalog = Assets.from({
  config: { kind: 'json', source: 'config.json', parse: (raw: unknown): Config => raw as Config },
});

// value config with `parse` → AssetRef<R>
type _ConfigIsRef = Expect<Equal<typeof catalog.config, AssetRef<Config>>>;
type _ConfigValue = Expect<Equal<typeof catalog.config.value, Config>>;

// resolved map from load(catalog) unwraps to the parsed value
declare const loader: Loader;
function loadIt() {
  return loader.load(catalog);
}
type LoadedMap = Awaited<ReturnType<typeof loadIt>>;
type _ConfigResolved = Expect<Equal<LoadedMap['config'], Config>>;

export type { _ConfigIsRef, _ConfigResolved, _ConfigValue };
