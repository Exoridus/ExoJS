import { logger } from '#core/logging';

import { AssetImpl } from './Asset';
import type { AnyAssetConfig, AssetDefinitions, CatalogEntry, InferCatalogLeaf, OptionsForKind } from './AssetDefinitions';
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
 * Normalize a single catalog entry to a plain `{ kind, source, ...opts }`
 * config. A bare path string is resolved to its asset kind by file suffix
 * (asset-system v2 §5); an unregistered/ambiguous suffix throws a guiding
 * error pointing at `Asset.kind(...)`, compound suffixes, or extension registration. An
 * already-constructed `Asset` contributes its `_config`; a plain config passes
 * through unchanged.
 */
export function _normalizeEntry(value: CatalogEntry): AnyAssetConfig {
  if (typeof value === 'string') {
    const kind = resolveKindByPath(value);
    if (kind === undefined) {
      throw new Error(
        `Assets: no asset kind is registered for the extension of "${value}". ` +
          `Annotate it with Asset.kind(...), use a compound suffix, or register the type's extension (registerExtensionKind / an AssetBinding).`,
      );
    }
    const config = { kind, source: value };
    return config as AnyAssetConfig;
  }
  return value instanceof AssetImpl ? value._config : (value as AnyAssetConfig);
}

// ---------------------------------------------------------------------------
// Dev-mode typo guard (#311)
// ---------------------------------------------------------------------------

/**
 * String keys that are read as language/library protocol probes (`await`
 * calls `Get(value, "then")`; `JSON.stringify` calls `Get(value, "toJSON")`)
 * rather than as an actual catalog-entry access. Excluded from the dev
 * typo-guard warning so stringifying or (accidentally) awaiting a catalog
 * doesn't produce a spurious "not a defined catalog key" warning.
 */
const ASSETS_DEV_PROXY_DUCK_TYPING_KEYS = new Set(['then', 'toJSON']);

/**
 * Per-instance counter for the dev typo guard's warn-once key (below). Two
 * unrelated catalogs missing the SAME key name must each get their own
 * diagnostic — a global dedup key would silently swallow the second
 * catalog's warning after the first one fires, defeating the point of the
 * guard (adversarial review, 2026-07-13: opus and fable both independently
 * flagged this).
 */
let assetsDevProxyInstanceCounter = 0;

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
      // `_config`), or a plain config all normalize to `{ kind, source, ...opts }`,
      // then to a meta-stamped handle-hybrid leaf. An already-constructed Asset is
      // CONVERTED to a leaf — it is no longer passed through by reference (pre-1.0
      // breaking change).
      const config = _normalizeEntry(value);
      const { kind, source, ...rest } = config;
      const opts = Object.keys(rest).length > 0 ? rest : undefined;
      const leaf = createLeaf(kind, source, opts);

      entries[key] = leaf;

      Object.defineProperty(this, key, {
        value: leaf,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }

    this.entries = entries as InferAssetsEntries<M>;

    // #311: a typo'd or dynamic catalog-key read (`bag.logoo`, `bag[computedKey]`)
    // is otherwise a silent `undefined` — warn once per key in dev instead.
    // __DEV__-gated: zero cost and no Proxy indirection in production.
    if (__DEV__) {
      const instanceId = assetsDevProxyInstanceCounter++;

      return new Proxy(this, {
        get(target, key, receiver) {
          const value = Reflect.get(target, key, receiver);

          if (typeof key === 'string' && !ASSETS_DEV_PROXY_DUCK_TYPING_KEYS.has(key) && !Reflect.has(target, key)) {
            const definedKeys = Object.keys(target).filter(k => k !== 'entries');

            logger.warn(`Assets: "${key}" is not a defined catalog key. Defined keys: ${definedKeys.join(', ')}.`, {
              source: 'Assets',
              once: `assets:missing-key:${instanceId}:${key}`,
            });
          }

          return value;
        },
      });
    }
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
 *   config: { kind: 'json', source: '/title.json' },
 * });
 *
 * TitleAssets.logo;    // Texture (placeholder until adopted)
 * TitleAssets.config;  // AssetRef<unknown>
 * loader.load(TitleAssets);
 * ```
 */
export type Assets<M extends Record<string, CatalogEntry>> = AssetsImpl<M> & InferAssetsProperties<M>;

type AssetsConstructorFn = new <const M extends Record<string, CatalogEntry>>(definition: M) => Assets<M>;

type AssetsFacade = AssetsConstructorFn & {
  /**
   * Build a typed catalog. Each field may be a bare path string (kind inferred
   * from its suffix), an `Asset.kind(...)` descriptor, or an explicit config. Bare
   * strings only resolve for leaf-capable kinds; ambiguous/unregistered
   * suffixes need `Asset.kind(...)`. (asset-system v2 §4.1, §5)
   *
   * @remarks The `const` type parameter preserves each field's string LITERAL
   * (e.g. `'ship.png'`) so the file suffix can be classified. Without it, under
   * a `strictNullChecks: false` tsconfig (e.g. the examples config) the literal
   * widens to `string`, `KindByPath<string>` collapses to `never`, and every
   * leaf degrades to `unknown` (surfacing as `{}`) — see the strict:false type
   * test `test/type-tests/assets-strict-false.type-test.ts`.
   */
  from<const M extends Record<string, CatalogEntry>>(definition: M): Assets<M>;

  /**
   * Build a single meta-stamped leaf (a usable placeholder resource or an
   * `AssetRef`) from ONE descriptor — the explicit single-asset alternative to
   * wrapping it in a one-field {@link from} catalog (asset-system v2 §5). Accepts
   * the same descriptor set as a catalog field: a bare path, an `Asset.kind(...)`
   * descriptor, or an explicit `{ kind, source, ...opts }` config. The leaf
   * starts `'idle'` until a loader adopts it.
   *
   * @example
   * ```ts
   * const chunk = Assets.one({ kind: 'json', source: `chunks/${cx}_${cy}.json` });
   * loader.load(chunk, { background: true });
   * await chunk.loaded;
   * ```
   */
  one<const E extends CatalogEntry>(entry: E): InferCatalogLeaf<E>;

  /**
   * Build a record of same-`kind` configs to SPREAD into {@link from}, applying
   * `shared` options to every entry (asset-system v2 §6). A per-entry object
   * overrides the shared options; a bare-string entry takes just the shared
   * options. Entries do not repeat the `kind`.
   *
   * @remarks `group()` is a SAME-KIND helper: every entry is stamped with the
   * `kind` passed here. An entry may therefore NOT carry its own `kind` — the
   * type forbids it (`kind?: never`) and the runtime rejects it with a guiding
   * error (A2). This closes the former silent-override hole where `{ kind,
   * ...shared, ...entry }` let an `entry.kind` win. To COMBINE different kinds,
   * spread each group into {@link from} (as the example shows) — do not nest one
   * group's output inside another group's entries (nesting produces kind-carrying
   * values and is rejected).
   *
   * @example
   * ```ts
   * Assets.from({
   *   ...Assets.group('texture', { player: 'player.png', enemy: 'enemy.png' }, { samplerOptions: { minFilter: 'nearest' } }),
   *   ...Assets.group('sound',   { jump: 'jump.wav', hit: 'hit.wav' }),
   * });
   * ```
   */
  group<K extends keyof AssetDefinitions, E extends Record<string, string | ({ source: string; kind?: never } & OptionsForKind<K>)>>(
    kind: K,
    entries: E,
    shared?: OptionsForKind<K>,
  ): { readonly [P in keyof E]: { kind: K } & AssetDefinitions[K]['config'] };
};

(AssetsImpl as unknown as { from: unknown }).from = function from<const M extends Record<string, CatalogEntry>>(definition: M): Assets<M> {
  return new (AssetsImpl as unknown as AssetsConstructorFn)(definition as never);
};

(AssetsImpl as unknown as { one: unknown }).one = function one<const E extends CatalogEntry>(entry: E): InferCatalogLeaf<E> {
  const { kind, source, ...rest } = _normalizeEntry(entry);
  const opts = Object.keys(rest).length > 0 ? rest : undefined;
  return createLeaf(kind, source, opts) as unknown as InferCatalogLeaf<E>;
};

(AssetsImpl as unknown as { group: unknown }).group = function group(
  kind: keyof AssetDefinitions,
  entries: Record<string, string | ({ source: string } & Record<string, unknown>)>,
  shared?: object,
): Record<string, AnyAssetConfig> {
  const out: Record<string, AnyAssetConfig> = {};
  const base = shared ?? {};

  for (const [key, entry] of Object.entries(entries)) {
    // `group()` is a same-kind helper: an entry may not carry its own `kind`.
    // Reject it instead of letting `{ kind, ...base, ...entry }` silently
    // override the group kind (A2). This also rejects a nested group's output
    // (whose values are kind-carrying configs) — combine groups by spreading
    // each into `Assets.from(...)`, not by nesting.
    if (typeof entry !== 'string' && Object.hasOwn(entry, 'kind')) {
      throw new Error(
        `Assets.group('${String(kind)}', …): entry "${key}" must not carry its own "kind" — group() stamps a single kind on every entry. ` +
          `To combine different kinds, spread each Assets.group(...) into Assets.from({ ... }); do not nest one group inside another.`,
      );
    }

    // A per-entry object overrides the shared options; a bare string takes only
    // the shared options. Either way the group's `kind` is stamped on.
    out[key] = (typeof entry === 'string' ? { kind, source: entry, ...base } : { kind, ...base, ...entry }) as AnyAssetConfig;
  }

  return out;
};

export const Assets = AssetsImpl as unknown as AssetsFacade;
