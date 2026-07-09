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
   * Asset.kind('texture', 'player.png');            // Asset<Texture>
   * Asset.kind<LevelData>('json', 'levels/01.json'); // Asset<LevelData>
   * ```
   */
  kind<K extends keyof AssetDefinitions>(kind: K, source: string, options?: OptionsForKind<K>): Asset<AssetDefinitions[K]['resource']>;
  kind<T>(kind: ValueAssetKind, source: string, options?: OptionsForKind<ValueAssetKind>): Asset<T>;
};

export const Asset = AssetImpl as unknown as AssetFacade;

// Attach the runtime `kind` static onto the facade the constructor cast produced.
(Asset as unknown as { kind: (kind: keyof AssetDefinitions, source: string, options?: object) => Asset<unknown> }).kind = (kind, source, options) => _makeAsset(kind, source, options);

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
