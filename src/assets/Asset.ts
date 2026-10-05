import type { AnyAssetConfig, AssetDefinitions, AssetTypeName, LeaflessAssetKind, OptionsForKind, ValueAssetKind } from './AssetDefinitions';
import { _requestConfig } from './assetMeta';
import type { AnyAssetType, AssetOptionsArgument } from './AssetType';

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/** @internal */
export class AssetImpl {
  /** @internal */
  public readonly _config: AnyAssetConfig;

  /**
   * The type that minted this descriptor, when one did.
   *
   * A catalog needs the type to know what leaf to hand out, and a type an
   * application installs of its own is unknown to every table outside it - so
   * the descriptor carries it rather than being looked up by name.
   * @internal
   */
  public readonly _assetType?: AnyAssetType;

  public constructor(config: AnyAssetConfig, assetType?: AnyAssetType) {
    this._config = config;

    if (assetType !== undefined) {
      this._assetType = assetType;
    }
  }

  public get type(): AssetTypeName {
    return this._config.type;
  }

  public get source(): string {
    return this._config.source;
  }
}

// ---------------------------------------------------------------------------
// Public interface & constructor facade
// ---------------------------------------------------------------------------

/** A typed, loadable asset reference. Holds config only - no loaded resource. */
export interface Asset<T> {
  /** @internal */
  readonly _config: AnyAssetConfig;
  /** @internal */
  readonly _assetType?: AnyAssetType;
  readonly type: AssetTypeName;
  readonly source: string;
  /** Phantom type marker - never actually present at runtime. */
  readonly _resource?: T;
}

declare const VALUE_ASSET: unique symbol;
declare const RESOURCE_ASSET: unique symbol;
declare const LEAFLESS_ASSET: unique symbol;

/**
 * A descriptor whose type hands out a deferred `AssetRef<T>` as its catalog
 * leaf - even when `T` is an object type (e.g. typed JSON). The brand is a
 * phantom (never present at runtime); it mirrors the type's `leaf: 'ref'`.
 */
export type ValueAsset<T> = Asset<T> & { readonly [VALUE_ASSET]: true };

/**
 * A descriptor whose type hands out the resource itself as its catalog leaf,
 * empty until the payload arrives and healed in place (`Texture`, `Sound`).
 * The brand is a phantom; it mirrors a type whose `leaf` is a seamless adapter.
 */
export type ResourceAsset<T> = Asset<T> & { readonly [RESOURCE_ASSET]: true };

/**
 * A descriptor whose type has no catalog leaf (`leaf: 'none'`): it loads
 * directly, but cannot be held by a catalog or handed out by `get()`. The
 * brand is a phantom.
 */
export type LeaflessAsset<T> = Asset<T> & { readonly [LEAFLESS_ASSET]: true };

/**
 * The descriptor a built-in or declaration-merged asset type produces, branded
 * with the leaf policy that type declares at runtime.
 */
export type AssetForKind<K extends keyof AssetDefinitions> = K extends ValueAssetKind
  ? ValueAsset<AssetDefinitions[K]['resource']>
  : K extends LeaflessAssetKind
    ? LeaflessAsset<AssetDefinitions[K]['resource']>
    : ResourceAsset<AssetDefinitions[K]['resource']>;

type AssetConstructorFn = new <K extends keyof AssetDefinitions>(config: { type: K } & AssetDefinitions[K]['config']) => AssetForKind<K>;

type AssetFacade = AssetConstructorFn & {
  /**
   * The single typed descriptor builder. Replaces the
   * per-class `.of()` statics. `type` autocompletes from {@link AssetDefinitions};
   * the resource type is inferred from `type`; `options` is that type's option bag,
   * required when the type has a required option (a `font` needs its `family`).
   * The `<T>` generic is accepted ONLY for value/ref types, where it annotates the
   * decoded value - passing `<T>` to a resource type is a type error.
   *
   * `type` and `source` name the request and are reserved: an option bag that
   * carries either key throws instead of silently redirecting the request.
   *
   * @example
   * ```ts
   * Asset.type('texture', 'player.png');              // ResourceAsset<Texture>
   * Asset.type<LevelData>('json', 'levels/01.json');  // ValueAsset<LevelData> → AssetRef in a catalog
   * Asset.type('font', 'ui.woff2', { family: 'UI' }); // LeaflessAsset<FontFace> → load directly
   * ```
   */
  type<K extends keyof AssetDefinitions>(type: K, source: string, ...options: AssetOptionsArgument<OptionsForKind<K>>): AssetForKind<K>;
  type<T>(type: ValueAssetKind, source: string, options?: OptionsForKind<ValueAssetKind>): ValueAsset<T>;
};

export const Asset = AssetImpl as unknown as AssetFacade;

// Attach the runtime `type` static - the single POJO descriptor factory that
// backs `Asset.type(...)`.
(Asset as unknown as { type: (type: keyof AssetDefinitions, source: string, options?: object) => Asset<unknown> }).type = (type, source, options) =>
  new AssetImpl(_requestConfig(type, source, options));
