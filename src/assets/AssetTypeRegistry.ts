import type { AssetHandler, AssetLoadRequest } from '#extensions/Extension';

import type { AssetDefinitions } from './AssetDefinitions';
import { getExtensionKind, normalizeExtension } from './extensionKindRegistry';
import type { AssetConstructor } from './FactoryRegistry';
import type { AssetLoaderContext } from './Loader';
import type { SeamlessAdapter } from './seamless';

/** Stored entry for handler-based asset bindings (via `bindAsset`). */
export interface HandlerEntry {
  load: (config: unknown, ctx: AssetLoaderContext) => Promise<unknown>;
  /** Optional identity-relevant discriminator appended to the canonical key; absent means type + locator alone. */
  getIdentityDiscriminator?: (source: string, options: unknown) => string;
  /** Optional byte-source constructor used by container loading (bypasses fetch). */
  createFromBytes?: (bytes: ArrayBuffer, options?: unknown) => Promise<unknown>;
  /** Optional per-resource teardown, invoked by `AssetResidency` when a value asset of this type is evicted at refcount 0. */
  dispose?: (resource: unknown) => void;
  /** Optional per-type IDB namespace for `context.fetchX()` calls made by this binding's handler. */
  storageName?: string;
}

/**
 * Owns constructor-based asset type identification for a {@link Loader}
 * instance: type-name and file-extension mappings, `bindAsset` handlers,
 * seamless-adapter bindings, and per-instance type IDs / key derivation.
 *
 * The bulk of it was extracted from `Loader` as a behavior-preserving
 * relocation; the extension→type resolution surface ({@link registerType},
 * {@link resolveExtensionType}, {@link _resolveTypeForPath}) was added here
 * afterwards and has no `Loader` ancestor. That surface layers three tiers, in
 * order: the explicit app-local {@link registerType} override, the type declared
 * by the `bindAsset` binding that claimed the suffix, and the global
 * `defineAsset` default.
 */
export class AssetTypeRegistry {
  private readonly _assetTypeMap = new Map<string, AssetConstructor>();
  private readonly _typeIds = new WeakMap<AssetConstructor, number>();
  private readonly _handlerFunctions = new Map<AssetConstructor, HandlerEntry>();
  private readonly _extensionMap = new Map<string, AssetConstructor>();
  private readonly _boundHandlers: AssetHandler[] = [];
  private readonly _seamlessAdapters = new Map<AssetConstructor, SeamlessAdapter<unknown>>();
  /** Tier 1 — explicit app-local overrides, written only by {@link registerType}. */
  private readonly _extensionOverrides = new Map<string, keyof AssetDefinitions>();
  /** Tier 2 — binding-declared defaults, written only by {@link bindAsset}'s `type`. */
  private readonly _bindingExtensionTypes = new Map<string, keyof AssetDefinitions>();
  private _nextTypeId = 1;

  /** Registers the seamless-handle adapter for `type`. One adapter per type. */
  public registerSeamlessAdapter<T>(type: AssetConstructor<T>, adapter: SeamlessAdapter<T>): void {
    if (this._seamlessAdapters.has(type)) {
      throw new Error(`A seamless adapter is already registered for ${this._describeType(type)}.`);
    }

    this._seamlessAdapters.set(type, adapter);
  }

  /**
   * Atomically bind all keys for one AssetBinding to a pre-created handler.
   * Validates all binding-owned keys BEFORE mutating any map. A conflicting
   * constructor, type name, or binding extension throws before any mutation.
   *
   * When `type` is given, each declared extension is also recorded in the
   * binding-declared extension→type table read by {@link resolveExtensionType}
   * (tier 2, below an explicit {@link registerType} override and above the
   * global `defineAsset` default) — and only then does the suffix take part in
   * bare-path resolution ({@link _resolveTypeForPath}). A binding that declares
   * `extensions` without a `type` still reserves those suffixes (so a later
   * conflicting binding throws), but its assets must be named with
   * `Asset.type(...)`. An existing `registerType` override for one of these
   * suffixes is not a conflict: the override simply keeps winning.
   */
  public bindAsset<Result = unknown, Options = undefined>(
    keys: {
      ctor: AssetConstructor<Result>;
      type?: keyof AssetDefinitions;
      typeNames?: readonly string[];
      extensions?: readonly string[];
      seamless?: SeamlessAdapter<Result>;
      storageName?: string;
    },
    handler: AssetHandler<Result, Options>,
  ): void {
    const normalizedExts: string[] = [];
    const resolvedNames: string[] = keys.typeNames !== undefined ? [...keys.typeNames] : [];

    // Normalise extension keys
    for (const ext of keys.extensions ?? []) {
      normalizedExts.push(normalizeExtension(ext));
    }

    // Validate: detect duplicates within this binding
    const seenExts = new Set<string>();

    for (const ext of normalizedExts) {
      if (seenExts.has(ext)) {
        throw new Error(`Duplicate extension key ".${ext}" within a single asset binding.`);
      }

      seenExts.add(ext);
    }

    // Validate: detect conflicts with already-registered keys — throw before any mutation
    if (this._handlerFunctions.has(keys.ctor)) {
      throw new Error(`An asset handler is already registered for ${keys.ctor.name}.`);
    }

    this._assertSeamlessAdapterAvailable(keys.ctor, keys.seamless);

    for (const name of resolvedNames) {
      if (this._assetTypeMap.has(name)) {
        throw new Error(`Asset type name "${name}" is already registered.`);
      }
    }

    for (const ext of normalizedExts) {
      if (this._extensionMap.has(ext)) {
        throw new Error(`File extension ".${ext}" is already mapped to an asset type.`);
      }
    }

    // No separate validation for the binding-declared extension→type table: it
    // is keyed exactly like `_extensionMap`, whose check above already rejects a
    // second binding claiming the same suffix. A `registerType` override for the
    // suffix is deliberately NOT a conflict — it simply outranks this binding.

    // All validation passed — install atomically.
    this._handlerFunctions.set(keys.ctor, this._createHandlerEntry<Result, Options>(handler, keys.storageName));

    for (const name of resolvedNames) {
      this._assetTypeMap.set(name, keys.ctor);
    }

    for (const ext of normalizedExts) {
      this._extensionMap.set(ext, keys.ctor);
    }

    this._applyBindingExtensionTypes(normalizedExts, keys.type);

    // Own this handler for lifecycle management. Cast to the erased AssetHandler
    // for storage; destroy() is the only method called on entries in this array.
    this._boundHandlers.push(handler as AssetHandler);

    if (keys.seamless !== undefined) {
      this.registerSeamlessAdapter(keys.ctor, keys.seamless);
    }
  }

  /**
   * Erase one {@link AssetHandler}'s typed surface into the flat
   * {@link HandlerEntry} every dispatch path reads. Each optional hook is
   * carried over only when the handler actually implements it, so a missing
   * `getIdentityDiscriminator`/`createFromBytes`/`dispose` stays `undefined` on the entry
   * rather than becoming a wrapper that calls nothing.
   *
   * This is the single type-erasure boundary of the binding install: the
   * internal registry uses a flat config `{ source, ...fields }`, while the
   * public `AssetHandler<Result, Options>` interface uses
   * `AssetLoadRequest<Options> = { source, options? }`. The `toRequest` helper
   * below is the only place the erased flat config is cast back to the typed
   * request — justified by the `AssetBinding<Result, Options>` contract that
   * associates this handler's `Options` with the registered constructor.
   */
  private _createHandlerEntry<Result, Options>(handler: AssetHandler<Result, Options>, storageName: string | undefined): HandlerEntry {
    const toRequest = (config: unknown): AssetLoadRequest<Options> => {
      const { source, ...rest } = config as { source: string } & Record<string, unknown>;

      if (Object.keys(rest).length === 0) {
        return { source };
      }

      return { source, options: rest as Options };
    };

    const boundDiscriminator = handler.getIdentityDiscriminator?.bind(handler);
    const boundCreateFromBytes = handler.createFromBytes?.bind(handler);
    const boundDispose = handler.dispose?.bind(handler);

    return {
      load: (config, ctx) => handler.load(toRequest(config), ctx),
      ...(boundDiscriminator && {
        getIdentityDiscriminator: (source: string, options: unknown) => boundDiscriminator({ source, options: options as Options }),
      }),
      ...(boundCreateFromBytes && { createFromBytes: (bytes: ArrayBuffer, options?: unknown) => boundCreateFromBytes(bytes, options as Options) }),
      ...(boundDispose && { dispose: (resource: unknown) => boundDispose(resource as Result) }),
      ...(storageName !== undefined && { storageName }),
    };
  }

  /** Returns true if a handler is already registered for the given constructor. */
  public hasLoadable(type: AssetConstructor): boolean {
    return this._handlerFunctions.has(type);
  }

  /** Returns true if a type-name mapping is already registered. */
  public hasAssetType(typeName: string): boolean {
    return this._assetTypeMap.has(typeName);
  }

  /** Returns true if a file extension is already mapped to an asset type. Extension is normalised (leading dot stripped, lower-cased). */
  public hasExtension(ext: string): boolean {
    return this._extensionMap.has(normalizeExtension(ext));
  }

  /** The `bindAsset` handler entry for `type`, or `undefined`. */
  public getHandler(type: AssetConstructor): HandlerEntry | undefined {
    return this._handlerFunctions.get(type);
  }

  /** The seamless adapter registered for `type`, or `undefined`. */
  public getSeamlessAdapter(type: AssetConstructor): SeamlessAdapter<unknown> | undefined {
    return this._seamlessAdapters.get(type);
  }

  /** Returns true if a seamless adapter is registered for `type`. */
  public hasSeamlessAdapter(type: AssetConstructor): boolean {
    return this._seamlessAdapters.has(type);
  }

  /** Resolves a registered type-name (from `bindAsset`'s `typeNames`) to its constructor. */
  public resolveTypeName(name: string): AssetConstructor | undefined {
    return this._assetTypeMap.get(name);
  }

  /** @internal */
  public _getTypeId(type: AssetConstructor): number {
    let typeId = this._typeIds.get(type);

    if (typeId === undefined) {
      typeId = this._nextTypeId++;
      this._typeIds.set(type, typeId);
    }

    return typeId;
  }

  /**
   * The identity-relevant discriminator the bound handler contributes for a
   * request, or `undefined` when the type identifies by source alone. The core
   * always owns `type + locator`; a handler may only widen a key, never
   * replace it.
   * @internal
   */
  public _identityDiscriminator(type: AssetConstructor, source: string, options?: unknown): string | undefined {
    // The options object is handed over untouched rather than merged into a flat
    // config: canonicalization runs on every request, so it must not walk (and
    // possibly trip over) properties no type declares as identity-relevant.
    return this._handlerFunctions.get(type)?.getIdentityDiscriminator?.(source, options);
  }

  /**
   * Resolve the effective {@link AssetDefinitions} type for a whole path by
   * matching the basename's dot-suffixes longest-first: `hero.aseprite.json`
   * tries `aseprite.json` before `json`. Query/hash suffixes are ignored. Each
   * candidate suffix goes through {@link resolveExtensionType}, so the app-local
   * `registerType` override is consulted before the binding-declared type, which
   * in turn is consulted before the global default.
   *
   * This is the single bare-path resolution funnel: a `bindAsset` binding feeds
   * it only through its declared `type` (which `defineAsset` always sets), not
   * through the constructor-keyed extension map — that map now only guards
   * against duplicate extension registrations.
   * @internal
   */
  public _resolveTypeForPath(path: string): keyof AssetDefinitions | undefined {
    const [withoutQueryHash = ''] = path.split(/[?#]/, 1);
    const basename = withoutQueryHash.split('/').pop() ?? '';
    const parts = basename.split('.');

    for (let i = 1; i < parts.length; i++) {
      const type = this.resolveExtensionType(parts.slice(i).join('.'));

      if (type !== undefined) {
        return type;
      }
    }

    return undefined;
  }

  /** `bindAsset` install step: records `extensions` as this binding's declared default type; no-ops when `type` is absent. */
  private _applyBindingExtensionTypes(extensions: readonly string[], type: keyof AssetDefinitions | undefined): void {
    if (type === undefined) return;

    for (const ext of extensions) {
      this._bindingExtensionTypes.set(ext, type);
    }
  }

  /**
   * Registers an app-local extension→type override — the top tier of
   * {@link resolveExtensionType}, ahead of both the binding-declared default and
   * the global `defineAsset` table. Overriding a suffix a binding already claimed
   * (`registerType('json', 'ldtkMap')`) is the intended use, not a conflict.
   *
   * Idempotent for the same (extension, type) pair; throws only when a DIFFERENT
   * type was already registered here by an earlier `registerType` call — two
   * competing app-wide overrides for one suffix are ambiguous.
   */
  public registerType(extension: string, type: keyof AssetDefinitions): void {
    const key = normalizeExtension(extension);
    const existing = this._extensionOverrides.get(key);

    if (existing !== undefined && existing !== type) {
      throw new Error(
        `AssetTypeRegistry: extension ".${key}" is already registered to type "${existing}" on this ` +
          `app, cannot also register it as "${type}". Use Asset.type(...) for a one-off exception ` +
          `instead of a second app-wide override.`,
      );
    }

    this._extensionOverrides.set(key, type);
  }

  /**
   * Resolves an extension to its effective type for this app, in three tiers:
   * the explicit {@link registerType} override, then the type declared by the
   * `bindAsset` binding that claimed this suffix, then the global `defineAsset`
   * default. `undefined` when no tier has an entry.
   */
  public resolveExtensionType(extension: string): keyof AssetDefinitions | undefined {
    const key = normalizeExtension(extension);

    return this._extensionOverrides.get(key) ?? this._bindingExtensionTypes.get(key) ?? getExtensionKind(key);
  }

  /** @internal */
  public _describeType(type: AssetConstructor): string {
    return type.name.length > 0 ? type.name : '(anonymous type)';
  }

  private _assertSeamlessAdapterAvailable(type: AssetConstructor, adapter: SeamlessAdapter<unknown> | undefined): void {
    if (adapter !== undefined && this._seamlessAdapters.has(type)) {
      throw new Error(`A seamless adapter is already registered for ${this._describeType(type)}.`);
    }
  }

  /**
   * Builds the standard "no `bindAsset` handler registered" error for `type`,
   * shared by every dispatch path (`AssetDecoder._dispatchFetch`,
   * `AssetResidency._loadSingleAsset`) that requires one.
   * @internal
   */
  public _missingHandlerError(type: AssetConstructor): Error {
    return new Error(`No asset handler registered for ${this._describeType(type)}. Bind one via defineAsset()/bindAsset() first.`);
  }

  /** Destroys every bound `bindAsset` handler (deduplicated by identity) and clears handler/adapter maps. */
  public destroyHandlers(): void {
    const destroyedHandlers = new Set<AssetHandler>();

    for (const handler of this._boundHandlers) {
      if (!destroyedHandlers.has(handler)) {
        destroyedHandlers.add(handler);
        handler.destroy?.();
      }
    }

    this._boundHandlers.length = 0;
    this._handlerFunctions.clear();
    this._seamlessAdapters.clear();
  }

  /** Destroys every bound handler — see {@link destroyHandlers}. */
  public destroy(): void {
    this.destroyHandlers();
  }
}
