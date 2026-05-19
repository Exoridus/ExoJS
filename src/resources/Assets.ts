import type { Asset } from './Asset';
import { AssetImpl } from './Asset';
import type { AnyAssetConfig, AssetInput, InferAssetResource } from './AssetDefinitions';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export type InferAssetsEntries<M extends Record<string, AssetInput>> = {
  [K in keyof M]: Asset<InferAssetResource<M[K]>>;
};

type InferAssetsProperties<M extends Record<string, AssetInput>> = {
  readonly [K in keyof M]: Asset<InferAssetResource<M[K]>>;
};

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/** @internal */
export class AssetsImpl<M extends Record<string, AssetInput>> {
  public readonly entries: InferAssetsEntries<M>;

  public constructor(definition: M) {
    if (Object.hasOwn(definition, 'entries')) {
      throw new Error(
        'An Assets container may not define an asset named "entries": ' +
        'that name is reserved for the spread-composition helper.',
      );
    }

    const entries: Record<string, Asset<unknown>> = {};

    for (const key of Object.keys(definition)) {
      const value = definition[key];
      const assetRef: Asset<unknown> = value instanceof AssetImpl
        ? value
        : new AssetImpl(value as AnyAssetConfig);

      entries[key] = assetRef;

      Object.defineProperty(this, key, {
        value: assetRef,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }

    this.entries = entries as InferAssetsEntries<M>;
  }
}

// ---------------------------------------------------------------------------
// Public type & constructor facade
// ---------------------------------------------------------------------------

/**
 * A reusable, typed asset container.
 *
 * Plain configs are converted to `Asset<T>` instances; already-created
 * `Asset<T>` values are passed through. The container exposes direct
 * typed properties and an `entries` record for spread loading.
 *
 * @example
 * ```ts
 * const TitleAssets = new Assets({
 *   logo:  { type: 'texture', source: '/logo.png' },
 *   music: { type: 'music',   source: '/title.ogg' },
 * });
 *
 * TitleAssets.logo;  // Asset<Texture>
 * loader.load({ ...TitleAssets.entries });
 * ```
 */
export type Assets<M extends Record<string, AssetInput>> =
  AssetsImpl<M> & InferAssetsProperties<M>;

type AssetsConstructorFn = new <M extends Record<string, AssetInput>>(definition: M) => Assets<M>;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Assets = AssetsImpl as unknown as AssetsConstructorFn;
