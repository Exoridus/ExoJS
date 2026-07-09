import type { Asset } from './Asset';
import { AssetImpl } from './Asset';
import type { AnyAssetConfig, AssetDefinitions, AssetInput, ValueAssetKind } from './AssetDefinitions';
import { createLeaf } from './assetKindRegistry';
import type { AssetRef } from './AssetRef';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/**
 * The handle-hybrid a catalog leaf materializes as: a resource kind's leaf IS
 * the placeholder resource (`Texture`, `Sound`, …) that heals in place, while a
 * {@link ValueAssetKind}'s leaf is a deferred {@link AssetRef}.
 *
 * For a plain config the specific kind `K` is known, so value/resource is
 * classified precisely. For an already-constructed `Asset<T>` only the resource
 * type `T` survives, so we fall back to a structural heuristic — accurate for
 * the resource kinds that flow through catalogs.
 */
type InferLeaf<I extends AssetInput> =
  I extends Asset<infer T>
    ? T extends object
      ? T
      : AssetRef<T>
    : I extends { type: infer K extends keyof AssetDefinitions }
      ? K extends ValueAssetKind
        ? AssetRef<AssetDefinitions[K]['resource']>
        : AssetDefinitions[K]['resource']
      : never;

export type InferAssetsEntries<M extends Record<string, AssetInput>> = {
  [K in keyof M]: InferLeaf<M[K]>;
};

export type InferAssetsProperties<M extends Record<string, AssetInput>> = {
  readonly [K in keyof M]: InferLeaf<M[K]>;
};

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/** @internal */
export class AssetsImpl<M extends Record<string, AssetInput>> {
  public readonly entries: InferAssetsEntries<M>;

  public constructor(definition: M) {
    if (Object.hasOwn(definition, 'entries')) {
      throw new Error('An Assets container may not define an asset named "entries": ' + 'that name is reserved for the spread-composition helper.');
    }

    const entries: Record<string, object> = {};

    for (const key of Object.keys(definition)) {
      const value = definition[key];
      // Both a plain config and an already-constructed Asset (which carries its
      // `_config`) resolve to `{ type, source, ...opts }`, then to a meta-stamped
      // handle-hybrid leaf. An already-constructed Asset is CONVERTED to a leaf —
      // it is no longer passed through by reference (pre-1.0 breaking change).
      const config = value instanceof AssetImpl ? value._config : (value as AnyAssetConfig);
      const { type, source, ...rest } = config;
      const opts = Object.keys(rest).length > 0 ? rest : undefined;
      const leaf = createLeaf(type, source, opts);

      entries[key] = leaf;

      Object.defineProperty(this, key, {
        value: leaf,
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
 * Each field is materialized as a handle-hybrid leaf: a resource kind's leaf IS
 * a usable placeholder resource (`Texture`/`Sound`) that heals in place once
 * adopted by a loader; a value kind's leaf is an {@link AssetRef}. The container
 * exposes those leaves as direct typed properties and via an `entries` record.
 *
 * @example
 * ```ts
 * const TitleAssets = new Assets({
 *   logo:  { type: 'texture', source: '/logo.png' },
 *   config: { type: 'json',   source: '/title.json' },
 * });
 *
 * TitleAssets.logo;    // Texture (placeholder until adopted)
 * TitleAssets.config;  // AssetRef<unknown>
 * loader.load(TitleAssets);
 * ```
 */
export type Assets<M extends Record<string, AssetInput>> = AssetsImpl<M> & InferAssetsProperties<M>;

type AssetsConstructorFn = new <M extends Record<string, AssetInput>>(definition: M) => Assets<M>;

export const Assets = AssetsImpl as unknown as AssetsConstructorFn;
