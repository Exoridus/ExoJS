import type { AnyAssetConfig, AssetDefinitions } from './AssetDefinitions';

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/** @internal */
export class AssetImpl {
  /** @internal */
  public readonly _config: AnyAssetConfig;

  public constructor(config: AnyAssetConfig) {
    this._config = config;
  }

  public get type(): keyof AssetDefinitions {
    return this._config.type;
  }

  public get source(): string {
    return this._config.source;
  }
}

// ---------------------------------------------------------------------------
// Public interface & constructor facade
// ---------------------------------------------------------------------------

/** A typed, loadable asset reference. Holds config only — no loaded resource. */
export interface Asset<T> {
  /** @internal */
  readonly _config: AnyAssetConfig;
  readonly type: keyof AssetDefinitions;
  readonly source: string;
  /** Phantom type marker — never actually present at runtime. */
  readonly _resource?: T;
}

type AssetConstructorFn = new <K extends keyof AssetDefinitions>(config: { type: K } & AssetDefinitions[K]['config']) => Asset<AssetDefinitions[K]['resource']>;

export const Asset = AssetImpl as unknown as AssetConstructorFn;

/**
 * Build an {@link Asset} descriptor for an `X.of(source, opts?)` annotation
 * static (asset-system v2 §5). Lives here (not in each resource class) so
 * `Texture`/`Sound`/… import only this light POJO factory from `#resources/Asset`,
 * with no runtime edge back into the `#resources` barrel.
 * @internal
 */
export function _makeAsset<K extends keyof AssetDefinitions>(kind: K, source: string, opts?: object): Asset<AssetDefinitions[K]['resource']> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- generic `K` widens to `keyof AssetDefinitions` in a typed local, losing the type/config correlation `AnyAssetConfig` needs; the cast is required here, not just stylistic.
  return new AssetImpl({ type: kind, source, ...(opts ?? {}) } as AnyAssetConfig);
}
