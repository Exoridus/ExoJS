import type { AnyAssetConfig, AssetDefinitions, AssetTypeName, OptionsForKind, ValueAssetKind } from './AssetDefinitions';
import type { AnyAssetType } from './AssetType';

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

/**
 * A value/ref-type asset descriptor. Structurally an
 * {@link Asset}, but branded so a catalog classifies its leaf as a deferred
 * `AssetRef<T>` - even when `T` is an object type (e.g. typed JSON), where the
 * plain `T extends object` heuristic would otherwise misread it as a resource.
 * The brand is a phantom (never present at runtime).
 */
export type ValueAsset<T> = Asset<T> & { readonly [VALUE_ASSET]: true };

type AssetConstructorFn = new <K extends keyof AssetDefinitions>(config: { type: K } & AssetDefinitions[K]['config']) => Asset<AssetDefinitions[K]['resource']>;

type AssetFacade = AssetConstructorFn & {
  /**
   * The single typed descriptor builder. Replaces the
   * per-class `.of()` statics. `type` autocompletes from {@link AssetDefinitions};
   * the resource type is inferred from `type`; `options` is that type's option bag.
   * The `<T>` generic is accepted ONLY for value/ref types, where it annotates the
   * decoded value - passing `<T>` to a resource type is a type error.
   *
   * @example
   * ```ts
   * Asset.type('texture', 'player.png');             // Asset<Texture>
   * Asset.type<LevelData>('json', 'levels/01.json'); // ValueAsset<LevelData> → AssetRef in a catalog
   * ```
   */
  type<K extends keyof AssetDefinitions>(
    type: K,
    source: string,
    options?: OptionsForKind<K>,
  ): K extends ValueAssetKind ? ValueAsset<AssetDefinitions[K]['resource']> : Asset<AssetDefinitions[K]['resource']>;
  type<T>(type: ValueAssetKind, source: string, options?: OptionsForKind<ValueAssetKind>): ValueAsset<T>;
};

export const Asset = AssetImpl as unknown as AssetFacade;

// Attach the runtime `type` static - the single POJO descriptor factory that
// backs `Asset.type(...)`.
(Asset as unknown as { type: (type: keyof AssetDefinitions, source: string, options?: object) => Asset<unknown> }).type = (type, source, options) =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- generic `type` widens to `keyof AssetDefinitions`, losing the type/config correlation `AnyAssetConfig` needs; the cast is required here, not just stylistic.
  new AssetImpl({ type, source, ...options } as AnyAssetConfig);
