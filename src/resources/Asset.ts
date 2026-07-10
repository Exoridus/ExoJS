import type { AnyAssetConfig, AssetDefinitions, OptionsForKind, ValueAssetKind } from './AssetDefinitions';

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

  public get kind(): keyof AssetDefinitions {
    return this._config.kind;
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
  readonly kind: keyof AssetDefinitions;
  readonly source: string;
  /** Phantom type marker — never actually present at runtime. */
  readonly _resource?: T;
}

declare const VALUE_ASSET: unique symbol;

/**
 * A value/ref-kind asset descriptor (asset-system v2 delta §4). Structurally an
 * {@link Asset}, but branded so a catalog classifies its leaf as a deferred
 * `AssetRef<T>` — even when `T` is an object type (e.g. typed JSON), where the
 * plain `T extends object` heuristic would otherwise misread it as a resource.
 * The brand is a phantom (never present at runtime).
 */
export type ValueAsset<T> = Asset<T> & { readonly [VALUE_ASSET]: true };

type AssetConstructorFn = new <K extends keyof AssetDefinitions>(config: { kind: K } & AssetDefinitions[K]['config']) => Asset<AssetDefinitions[K]['resource']>;

type AssetFacade = AssetConstructorFn & {
  /**
   * The single typed descriptor builder (asset-system v2 delta §3). Replaces the
   * per-class `.of()` statics. `kind` autocompletes from {@link AssetDefinitions};
   * the resource type is inferred from `kind`; `options` is that kind's option bag.
   * The `<T>` generic is accepted ONLY for value/ref kinds, where it annotates the
   * decoded value — passing `<T>` to a resource kind is a type error.
   *
   * @example
   * ```ts
   * Asset.kind('texture', 'player.png');             // Asset<Texture>
   * Asset.kind<LevelData>('json', 'levels/01.json'); // ValueAsset<LevelData> → AssetRef in a catalog
   * ```
   */
  kind<K extends keyof AssetDefinitions>(
    kind: K,
    source: string,
    options?: OptionsForKind<K>,
  ): K extends ValueAssetKind ? ValueAsset<AssetDefinitions[K]['resource']> : Asset<AssetDefinitions[K]['resource']>;
  kind<T>(kind: ValueAssetKind, source: string, options?: OptionsForKind<ValueAssetKind>): ValueAsset<T>;
};

export const Asset = AssetImpl as unknown as AssetFacade;

// Attach the runtime `kind` static — the single POJO descriptor factory that
// backs `Asset.kind(...)`.
(Asset as unknown as { kind: (kind: keyof AssetDefinitions, source: string, options?: object) => Asset<unknown> }).kind = (kind, source, options) =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- generic `kind` widens to `keyof AssetDefinitions`, losing the type/config correlation `AnyAssetConfig` needs; the cast is required here, not just stylistic.
  new AssetImpl({ kind, source, ...(options ?? {}) } as AnyAssetConfig);
