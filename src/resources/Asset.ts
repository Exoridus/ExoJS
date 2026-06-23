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
