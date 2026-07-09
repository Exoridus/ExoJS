import { AssetImpl } from './Asset';
import type { AnyAssetConfig, CatalogEntry, InferCatalogLeaf } from './AssetDefinitions';
import { createLeaf } from './assetKindRegistry';
import { resolveKindByPath } from './extensionKindRegistry';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/**
 * The handle-hybrid a catalog leaf materializes as, delegating to
 * {@link InferCatalogLeaf}: a resource kind's leaf IS the placeholder resource
 * (`Texture`, `Sound`, …) that heals in place, while a value kind's leaf is a
 * deferred `AssetRef`. A bare path string is classified by its file suffix.
 */
type InferLeaf<I extends CatalogEntry> = InferCatalogLeaf<I>;

export type InferAssetsEntries<M extends Record<string, CatalogEntry>> = {
  [K in keyof M]: InferLeaf<M[K]>;
};

export type InferAssetsProperties<M extends Record<string, CatalogEntry>> = {
  readonly [K in keyof M]: InferLeaf<M[K]>;
};

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/**
 * Normalize a single catalog entry to a plain `{ type, source, ...opts }`
 * config. A bare path string is resolved to its asset kind by file suffix
 * (asset-system v2 §5); an unregistered/ambiguous suffix throws a guiding
 * error pointing at `X.of()`, compound suffixes, or extension registration. An
 * already-constructed `Asset` contributes its `_config`; a plain config passes
 * through unchanged.
 */
function _normalizeEntry(value: CatalogEntry): AnyAssetConfig {
  if (typeof value === 'string') {
    const kind = resolveKindByPath(value);
    if (kind === undefined) {
      throw new Error(
        `Assets: no asset kind is registered for the extension of "${value}". ` +
          `Annotate it with X.of(), use a compound suffix, or register the type's extension (registerExtensionKind / an AssetBinding).`,
      );
    }
    const config = { type: kind, source: value };
    return config as AnyAssetConfig;
  }
  return value instanceof AssetImpl ? value._config : (value as AnyAssetConfig);
}

/** @internal */
export class AssetsImpl<M extends Record<string, CatalogEntry>> {
  public readonly entries: InferAssetsEntries<M>;

  public constructor(definition: M) {
    if (Object.hasOwn(definition, 'entries')) {
      throw new Error('An Assets container may not define an asset named "entries": ' + 'that name is reserved for the spread-composition helper.');
    }

    const entries: Record<string, object> = {};

    for (const [key, value] of Object.entries(definition)) {
      // A bare path string, an already-constructed Asset (which carries its
      // `_config`), or a plain config all normalize to `{ type, source, ...opts }`,
      // then to a meta-stamped handle-hybrid leaf. An already-constructed Asset is
      // CONVERTED to a leaf — it is no longer passed through by reference (pre-1.0
      // breaking change).
      const config = _normalizeEntry(value);
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
 * adopted by a loader; a value kind's leaf is an `AssetRef`. The container
 * exposes those leaves as direct typed properties and via an `entries` record.
 *
 * @example
 * ```ts
 * const TitleAssets = Assets.from({
 *   logo:   'sprites/logo.png', // bare path — kind inferred from suffix
 *   config: { type: 'json', source: '/title.json' },
 * });
 *
 * TitleAssets.logo;    // Texture (placeholder until adopted)
 * TitleAssets.config;  // AssetRef<unknown>
 * loader.load(TitleAssets);
 * ```
 */
export type Assets<M extends Record<string, CatalogEntry>> = AssetsImpl<M> & InferAssetsProperties<M>;

type AssetsConstructorFn = new <M extends Record<string, CatalogEntry>>(definition: M) => Assets<M>;

type AssetsFacade = AssetsConstructorFn & {
  /**
   * Build a typed catalog. Each field may be a bare path string (kind inferred
   * from its suffix), an `X.of()` descriptor, or an explicit config. Bare
   * strings only resolve for leaf-capable kinds; ambiguous/unregistered
   * suffixes need `X.of()`. (asset-system v2 §4.1, §5)
   */
  from<M extends Record<string, CatalogEntry>>(definition: M): Assets<M>;
};

(AssetsImpl as unknown as { from: unknown }).from = function from<M extends Record<string, CatalogEntry>>(definition: M): Assets<M> {
  return new (AssetsImpl as unknown as AssetsConstructorFn)(definition as never);
};

export const Assets = AssetsImpl as unknown as AssetsFacade;
