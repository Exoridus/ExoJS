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
 * {@link InferCatalogLeaf}: a resource type's leaf IS the placeholder resource
 * (`Texture`, `Sound`, …) that heals in place, while a value type's leaf is a
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
// Composition helper types
// ---------------------------------------------------------------------------

/**
 * Any typed catalog, whatever its definition record — the constraint
 * {@link Assets.compose} accepts its arguments under, and the one to write when
 * a generic API of your own takes an arbitrary catalog (`<C extends AnyAssets>`)
 * without pinning its definition record.
 */
export type AnyAssets = AssetsImpl<Record<string, CatalogEntry>>;

/**
 * The definition record a catalog was built from. Recovered by inference
 * through {@link Assets} — its mapped-property half makes `M` inferable, which
 * the bare `AssetsImpl<infer M>` class reference alone is not.
 */
type DefinitionOf<C> = C extends Assets<infer M> ? M : never;

/** The per-catalog definition records of a composition argument tuple. */
type DefinitionsOf<Cs extends readonly AnyAssets[]> = { [I in keyof Cs]: DefinitionOf<Cs[I]> };

/** Left-to-right intersection of every definition record in a tuple. */
type MergeDefinitions<Ms extends readonly unknown[]> = Ms extends readonly [infer H, ...infer R] ? H & MergeDefinitions<R> : unknown;

/** Collapse an intersection into a single flat object type (hover/error readability). */
type FlattenDefinition<T> = { [K in keyof T]: T[K] };

/**
 * Re-assert a computed definition record against the `Assets` type parameter
 * constraint. Both branches satisfy `Record<string, CatalogEntry>`, so TS
 * accepts this where it cannot verify a computed mapped/intersection type
 * directly.
 */
type AsDefinition<T> = T extends Record<string, CatalogEntry> ? T : never;

/** Keys defined by more than one catalog in a composition tuple. */
type SharedKeys<Ms extends readonly unknown[]> = Ms extends readonly [infer H, ...infer R]
  ? Extract<Extract<keyof H, string>, keyof MergeDefinitions<R>> | SharedKeys<R>
  : never;

type IsIdentical<X, Y> = (<G>() => G extends X ? 1 : 2) extends <G>() => G extends Y ? 1 : 2 ? true : false;

/**
 * The shared keys that actually CONFLICT: a key contributed by several catalogs
 * is fine only while every one of them declares an identical entry — the
 * type-level approximation of a diamond, where the same catalog reaches the
 * composition twice. Keys whose declarations differ are a genuine ambiguity and
 * are reported. Two DIFFERENT catalogs declaring an identical entry are
 * indistinguishable here; the runtime, which compares catalog identity rather
 * than declaration shape, rejects those.
 */
type ConflictingKeys<Ms extends readonly unknown[]> = {
  [K in SharedKeys<Ms>]: IsIdentical<Extract<Ms[number], Record<K, unknown>>[K], MergeDefinitions<Ms>[K & keyof MergeDefinitions<Ms>]> extends true ? never : K;
}[SharedKeys<Ms>];

/**
 * The result of a conflicting {@link AssetsFacade.compose} call: a diagnostic
 * OBJECT type naming the offending keys, so the failure reads as an explanation
 * at every use site of the result instead of collapsing to `never`.
 *
 * Deliberately not a string: a message string is assignable to the loader's
 * bare-path parameters, which would let a conflicting composition slip into
 * `loader.load(...)`/`loader.get(...)` as if it were an asset path. An object
 * shape matches no loader input, so a conflict is rejected wherever it is used.
 */
interface ComposeConflict<K extends string> {
  // The key is interpolated ONCE: a template literal distributes over every
  // union occurrence independently, so a second `${K}` would blow a two-key
  // conflict up into a four-message cross product.
  readonly _assetsComposeError: `Assets.compose(): duplicate catalog key "${K}" — two catalogs define it, use Assets.extend() to override it deliberately.`;
  /** The colliding keys, as the full union — one member per duplicated key. */
  readonly _conflictingKeys: K;
}

/** The composed catalog type, or the {@link ComposeConflict} diagnostic type. */
type ComposeResult<Cs extends readonly AnyAssets[]> = [ConflictingKeys<DefinitionsOf<Cs>>] extends [never]
  ? Assets<AsDefinition<FlattenDefinition<MergeDefinitions<DefinitionsOf<Cs>>>>>
  : ComposeConflict<ConflictingKeys<DefinitionsOf<Cs>>>;

/** A base definition record with `E`'s entries added, deliberately overriding same-named keys. */
type ExtendDefinition<M, E> = { [K in keyof M | keyof E]: K extends keyof E ? E[K] : K extends keyof M ? M[K] : never };

/** The derived catalog type produced by {@link AssetsFacade.extend}. */
type ExtendResult<M extends Record<string, CatalogEntry>, E extends Record<string, CatalogEntry>> = Assets<AsDefinition<ExtendDefinition<M, E>>>;

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * How a catalog came to be. Purely descriptive: it carries no ownership, no
 * claims and no residency state, and exists so composition stays traceable —
 * `keyOrigins` is what lets a diamond (the same catalog reaching a composition
 * along two paths) be told apart from two catalogs racing for one key.
 * @internal
 */
export interface AssetsProvenance {
  /** The facade call that produced the catalog. */
  readonly kind: 'from' | 'compose' | 'extend';
  /** The catalogs this one was built from, in argument order. Empty for `from`. */
  readonly sources: readonly AnyAssets[];
  /** Keys `extend()` deliberately re-declared over its base. */
  readonly overrides: readonly string[];
  /** Key → the catalog that originally DECLARED it (never a catalog that merely re-exports it). */
  readonly keyOrigins: ReadonlyMap<string, AnyAssets>;
}

/**
 * Provenance store, keyed by the catalog CALLERS hold (the dev Proxy, where
 * there is one). Module-private on purpose: provenance is bookkeeping, not part
 * of the catalog's surface, so it lives beside the catalog rather than on it —
 * nothing reachable from a catalog object exposes `keyOrigins`, and a user
 * cannot mutate it.
 */
const catalogProvenance = new WeakMap<AnyAssets, AssetsProvenance>();

/**
 * Read a catalog's composition provenance. The single internal accessor —
 * anything that needs to introspect composition goes through here.
 * @internal
 */
export function _readProvenance(catalog: AnyAssets): AssetsProvenance | undefined {
  return catalogProvenance.get(catalog);
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/**
 * Normalize a single catalog entry to a plain `{ type, source, ...opts }`
 * config. A bare path string is resolved to its asset type by file suffix
 * (asset-system v2 §5); an unregistered/ambiguous suffix throws a guiding
 * error pointing at `Asset.type(...)`, compound suffixes, or extension registration. An
 * already-constructed `Asset` contributes its `_config`; a plain config passes
 * through unchanged.
 */
export function _normalizeEntry(value: CatalogEntry): AnyAssetConfig {
  if (typeof value === 'string') {
    const type = resolveKindByPath(value);
    if (type === undefined) {
      throw new Error(
        `Assets: no asset type is registered for the extension of "${value}". ` +
          `Annotate it with Asset.type(...), use a compound suffix, or register the type's extension (registerExtensionKind / an AssetBinding).`,
      );
    }
    const config = { type, source: value };
    return config as AnyAssetConfig;
  }
  return value instanceof AssetImpl ? value._config : (value as AnyAssetConfig);
}

/** Materialize one catalog entry into its meta-stamped handle-hybrid leaf. */
function createEntryLeaf(value: CatalogEntry): object {
  const { type, source, ...rest } = _normalizeEntry(value);
  const opts = Object.keys(rest).length > 0 ? rest : undefined;

  return createLeaf(type, source, opts);
}

/**
 * Property names an `Assets` container owns itself, and which a catalog key may
 * therefore not shadow.
 */
const RESERVED_ASSETS_KEYS: Record<string, string> = {
  entries: 'that name is reserved for the spread-composition helper',
};

function assertUnreservedKey(key: string): void {
  const reason = RESERVED_ASSETS_KEYS[key];

  if (reason !== undefined) {
    throw new Error(`An Assets container may not define an asset named "${key}": ${reason}.`);
  }
}

// ---------------------------------------------------------------------------
// Dev-mode typo guard
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
 * guard.
 */
let assetsDevProxyInstanceCounter = 0;

/** @internal */
export class AssetsImpl<M extends Record<string, CatalogEntry>> {
  public readonly entries!: InferAssetsEntries<M>;

  public constructor(definition: M) {
    const entries: Record<string, object> = {};

    for (const [key, value] of Object.entries(definition)) {
      assertUnreservedKey(key);

      // A bare path string, an already-constructed Asset (which carries its
      // `_config`), or a plain config all normalize to `{ type, source, ...opts }`,
      // then to a meta-stamped handle-hybrid leaf. An already-constructed Asset is
      // CONVERTED to a leaf — it is no longer passed through by reference (pre-1.0
      // breaking change).
      entries[key] = createEntryLeaf(value);
    }

    return installCatalog(this, entries, 'from', [], [], new Map());
  }
}

/**
 * Install materialized leaves on a catalog instance: direct typed properties,
 * the `entries` record, and the composition provenance. Every catalog — built
 * by `new Assets(...)`/`from()`, `compose()` or `extend()` — goes through here,
 * so all three shapes are indistinguishable to the loader.
 *
 * `keyOrigins` carries the origins inherited from the input catalogs; any key
 * without one is declared HERE and is stamped with this instance.
 */
function installCatalog<M extends Record<string, CatalogEntry>>(
  instance: AssetsImpl<M>,
  leaves: Record<string, object>,
  kind: AssetsProvenance['kind'],
  sources: readonly AnyAssets[],
  overrides: readonly string[],
  keyOrigins: Map<string, AnyAssets>,
): Assets<M> {
  for (const [key, leaf] of Object.entries(leaves)) {
    Object.defineProperty(instance, key, {
      value: leaf,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }

  Object.defineProperty(instance, 'entries', {
    value: leaves,
    enumerable: true,
    configurable: false,
    writable: false,
  });

  // A typo'd or dynamic catalog-key read (`bag.logoo`, `bag[computedKey]`)
  // is otherwise a silent `undefined` — warn once per key in dev instead.
  // __DEV__-gated: zero cost and no Proxy indirection in production.
  let catalog = instance as Assets<M>;

  if (__DEV__) {
    const instanceId = assetsDevProxyInstanceCounter++;

    catalog = new Proxy(instance, {
      get(target, key, receiver): unknown {
        const value: unknown = Reflect.get(target, key, receiver);

        if (typeof key === 'string' && !ASSETS_DEV_PROXY_DUCK_TYPING_KEYS.has(key) && !Reflect.has(target, key)) {
          const definedKeys = Object.keys(target).filter(k => k !== 'entries');

          logger.warn(`Assets: "${key}" is not a defined catalog key. Defined keys: ${definedKeys.join(', ')}.`, {
            source: 'Assets',
            once: `assets:missing-key:${instanceId}:${key}`,
          });
        }

        return value;
      },
    }) as Assets<M>;
  }

  // Origins name the catalog CALLERS hold — the dev Proxy, where there is one —
  // so identity comparisons against a passed-in catalog line up. Any key without
  // an inherited origin is declared here.
  for (const key of Object.keys(leaves)) {
    if (!keyOrigins.has(key)) {
      keyOrigins.set(key, catalog);
    }
  }

  // Stored beside the catalog, keyed by the object callers hold: provenance is
  // not a catalog key and not a property, so `Object.keys(catalog)` and
  // `catalog.entries` stay exactly what the catalog declared.
  catalogProvenance.set(catalog, Object.freeze({ kind, sources, overrides, keyOrigins }) satisfies AssetsProvenance);

  return catalog;
}

/** Build a catalog from ALREADY materialized leaves, bypassing entry normalization. */
function adoptCatalog(
  leaves: Record<string, object>,
  kind: AssetsProvenance['kind'],
  sources: readonly AnyAssets[],
  overrides: readonly string[],
  keyOrigins: Map<string, AnyAssets>,
): AnyAssets {
  const instance = Object.create(AssetsImpl.prototype) as AssetsImpl<Record<string, CatalogEntry>>;

  return installCatalog(instance, leaves, kind, sources, overrides, keyOrigins);
}

/** The catalog a key was originally declared by — itself, for a `from()` catalog. */
function originOf(catalog: AnyAssets, key: string): AnyAssets {
  return catalogProvenance.get(catalog)?.keyOrigins.get(key) ?? catalog;
}

function assertIsCatalog(value: unknown, context: string): asserts value is AnyAssets {
  if (!(value instanceof AssetsImpl)) {
    throw new Error(`${context} expects an Assets catalog (Assets.from(...), Assets.compose(...) or Assets.extend(...)).`);
  }
}

// ---------------------------------------------------------------------------
// Public type & constructor facade
// ---------------------------------------------------------------------------

/**
 * A reusable, typed asset container.
 *
 * Each field is materialized as a handle-hybrid leaf: a resource type's leaf IS
 * a usable placeholder resource (`Texture`/`Sound`) that heals in place once
 * adopted by a loader; a value type's leaf is an `AssetRef`. The container
 * exposes those leaves as direct typed properties and via an `entries` record.
 *
 * @example
 * ```ts
 * const TitleAssets = Assets.from({
 *   logo:   'sprites/logo.png', // bare path — type inferred from suffix
 *   config: { type: 'json', source: '/title.json' },
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
   * Build a typed catalog. Each field may be a bare path string (type inferred
   * from its suffix), an `Asset.type(...)` descriptor, or an explicit config. Bare
   * strings only resolve for leaf-capable types; ambiguous/unregistered
   * suffixes need `Asset.type(...)`. (asset-system v2 §4.1, §5)
   *
   * @remarks The `const` type parameter preserves each field's string LITERAL
   * (e.g. `'ship.png'`) so the file suffix can be classified. Without it, under
   * a `strictNullChecks: false` tsconfig (e.g. the examples config) the literal
   * widens to `string`, `KindByPath<string>` collapses to `never`, and every
   * leaf degrades to `unknown` (surfacing as `{}`) — see the strict:false type
   * test `test/type-tests/assets-strict-false.type-test.ts`.
   *
   * @remarks Catalogs are values, not identities. Two calls with an identical
   * definition produce two distinct catalogs with two distinct sets of leaves:
   *
   * ```ts
   * Assets.from({ hero: 'hero.png' }) === Assets.from({ hero: 'hero.png' }); // false
   * ```
   *
   * The *payload* is still shared — the loader keys on type and source, so
   * `hero.png` is fetched once and both catalogs resolve to the same resource.
   * What is not shared is the claim bookkeeping: releasing one catalog does not
   * release the other's claim. Build a catalog once and pass it around when
   * that matters, rather than rebuilding an equal one at each call site.
   *
   * The same holds for {@link AssetsFacade.one} — a per-chunk descriptor built
   * in a streaming loop is a fresh object each time, which is fine for the
   * fetch (dedup still applies) but means it cannot be used as a lookup key.
   */
  from<const M extends Record<string, CatalogEntry>>(definition: M): Assets<M>;

  /**
   * Build a single meta-stamped leaf (a usable placeholder resource or an
   * `AssetRef`) from ONE descriptor — the explicit single-asset alternative to
   * wrapping it in a one-field {@link from} catalog (asset-system v2 §5). Accepts
   * the same descriptor set as a catalog field: a bare path, an `Asset.type(...)`
   * descriptor, or an explicit `{ type, source, ...opts }` config. The leaf
   * starts `'idle'` until a loader adopts it.
   *
   * @example
   * ```ts
   * const chunk = Assets.one({ type: 'json', source: `chunks/${cx}_${cy}.json` });
   * loader.load(chunk, { priority: LoadPriority.Background });
   * await chunk.loaded;
   * ```
   */
  one<const E extends CatalogEntry>(entry: E): InferCatalogLeaf<E>;

  /**
   * Build a record of same-`type` configs to SPREAD into {@link from}, applying
   * `shared` options to every entry (asset-system v2 §6). A per-entry object
   * overrides the shared options; a bare-string entry takes just the shared
   * options. Entries do not repeat the `type`.
   *
   * @remarks `group()` is a SAME-KIND helper: every entry is stamped with the
   * `type` passed here. An entry may therefore NOT carry its own `type` — the
   * type forbids it (`type?: never`) and the runtime rejects it with a guiding
   * error (A2). This closes the former silent-override hole where `{ type,
   * ...shared, ...entry }` let an `entry.type` win. To COMBINE different types,
   * spread each group into {@link from} (as the example shows) — do not nest one
   * group's output inside another group's entries (nesting produces type-carrying
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
  group<K extends keyof AssetDefinitions, E extends Record<string, string | ({ source: string; type?: never } & OptionsForKind<K>)>>(
    type: K,
    entries: E,
    shared?: OptionsForKind<K>,
  ): { readonly [P in keyof E]: { type: K } & AssetDefinitions[K]['config'] };

  /**
   * Combine several existing catalogs into one typed catalog. The result is an
   * ordinary `Assets` object — same direct typed properties, same `entries`,
   * same load/release behaviour — that SHARES its inputs' leaves rather than
   * re-materializing them: `Forest.logo === Shared.logo`, so loading the
   * composition heals the very handles the input catalogs already handed out.
   * Composition is descriptive only; it introduces no ownership and no claims.
   *
   * Two DIFFERENT catalogs may not declare the same key — that ambiguity is
   * rejected at compile time (for keys whose declarations differ) as a
   * diagnostic type naming them — which no loader input accepts — and always as
   * a throw at runtime. The same catalog reaching the composition twice along
   * different paths (a diamond) is NOT a conflict and deduplicates. To
   * re-declare a key on purpose, derive with {@link extend} instead.
   *
   * @example
   * ```ts
   * const ForestAssets = Assets.compose(SharedAssets, ForestLocalAssets);
   * loader.load(ForestAssets);
   * ```
   */
  compose<const Cs extends readonly AnyAssets[]>(...catalogs: Cs): ComposeResult<Cs>;

  /**
   * Derive a catalog from `base`: `entries` adds new keys and DELIBERATELY
   * re-declares existing ones. The result is an ordinary `Assets` object; `base`
   * is never mutated, and the keys it keeps stay the same leaf instances.
   *
   * An overridden key is re-declared BY the derived catalog — composing the
   * derived catalog back together with its base therefore conflicts on that key,
   * exactly as two independent declarations would.
   *
   * @example
   * ```ts
   * const CustomizedAssets = Assets.extend(SharedAssets, {
   *   theme: 'audio/forest.ogg',                                    // overrides the shared theme
   *   tree:  Asset.type('texture', 'sprites/tree.png', { mimeType: 'image/png' }),
   * });
   * ```
   */
  extend<M extends Record<string, CatalogEntry>, const E extends Record<string, CatalogEntry>>(base: Assets<M>, entries: E): ExtendResult<M, E>;
};

(AssetsImpl as unknown as { from: unknown }).from = function from<const M extends Record<string, CatalogEntry>>(definition: M): Assets<M> {
  return new (AssetsImpl as unknown as AssetsConstructorFn)(definition as never);
};

(AssetsImpl as unknown as { one: unknown }).one = function one<const E extends CatalogEntry>(entry: E): InferCatalogLeaf<E> {
  return createEntryLeaf(entry) as unknown as InferCatalogLeaf<E>;
};

(AssetsImpl as unknown as { compose: unknown }).compose = function compose(...catalogs: readonly AnyAssets[]): AnyAssets {
  const leaves: Record<string, object> = {};
  const keyOrigins = new Map<string, AnyAssets>();
  const conflicts = new Set<string>();

  for (const catalog of catalogs) {
    assertIsCatalog(catalog, 'Assets.compose(...)');

    for (const [key, leaf] of Object.entries(catalog.entries as Record<string, object>)) {
      const origin = originOf(catalog, key);
      const claimed = keyOrigins.get(key);

      // Same declaring catalog reaching the composition twice (a diamond) —
      // dedup instead of colliding with itself. Identity, not shape: two
      // catalogs that happen to declare the same source are still two
      // declarations, and stay a conflict.
      if (claimed !== undefined && claimed !== origin) {
        conflicts.add(key);
        continue;
      }

      keyOrigins.set(key, origin);
      leaves[key] = leaf;
    }
  }

  if (conflicts.size > 0) {
    const keys = [...conflicts];

    throw new Error(
      `Assets.compose(): duplicate catalog key${keys.length > 1 ? 's' : ''} ${keys.map(key => `"${key}"`).join(', ')} — ` +
        'two catalogs define the same key, use Assets.extend(base, { ... }) to override it deliberately.',
    );
  }

  return adoptCatalog(leaves, 'compose', catalogs, [], keyOrigins);
};

(AssetsImpl as unknown as { extend: unknown }).extend = function extend(base: AnyAssets, entries: Record<string, CatalogEntry>): AnyAssets {
  assertIsCatalog(base, 'Assets.extend(base, ...)');

  // Copy — the base catalog is never mutated, and the keys it keeps stay the
  // SAME leaf instances (a derived catalog is a view, not a re-materialization).
  const leaves: Record<string, object> = { ...(base.entries as Record<string, object>) };
  const keyOrigins = new Map<string, AnyAssets>(catalogProvenance.get(base)?.keyOrigins);
  const overrides: string[] = [];

  for (const [key, value] of Object.entries(entries)) {
    assertUnreservedKey(key);

    if (Object.hasOwn(leaves, key)) {
      overrides.push(key);
      // A deliberate override is a NEW declaration: drop the inherited origin so
      // the derived catalog becomes this key's declaring catalog, and composing
      // it back with its base conflicts like any other double declaration.
      keyOrigins.delete(key);
    }

    leaves[key] = createEntryLeaf(value);
  }

  return adoptCatalog(leaves, 'extend', [base], overrides, keyOrigins);
};

(AssetsImpl as unknown as { group: unknown }).group = function group(
  type: keyof AssetDefinitions,
  entries: Record<string, string | ({ source: string } & Record<string, unknown>)>,
  shared?: object,
): Record<string, AnyAssetConfig> {
  const out: Record<string, AnyAssetConfig> = {};
  const base = shared ?? {};

  for (const [key, entry] of Object.entries(entries)) {
    // `group()` is a same-type helper: an entry may not carry its own `type`.
    // Reject it instead of letting `{ type, ...base, ...entry }` silently
    // override the group type (A2). This also rejects a nested group's output
    // (whose values are type-carrying configs) — combine groups by spreading
    // each into `Assets.from(...)`, not by nesting.
    if (typeof entry !== 'string' && Object.hasOwn(entry, 'type')) {
      throw new Error(
        `Assets.group('${String(type)}', …): entry "${key}" must not carry its own "type" — group() stamps a single type on every entry. ` +
          `To combine different types, spread each Assets.group(...) into Assets.from({ ... }); do not nest one group inside another.`,
      );
    }

    // A per-entry object overrides the shared options; a bare string takes only
    // the shared options. Either way the group's `type` is stamped on.
    out[key] = (typeof entry === 'string' ? { type, source: entry, ...base } : { type, ...base, ...entry }) as AnyAssetConfig;
  }

  return out;
};

export const Assets = AssetsImpl as unknown as AssetsFacade;
