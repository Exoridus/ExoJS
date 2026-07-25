import type { AssetHandler, AssetLoadRequest } from '#extensions/Extension';

import type { Asset } from './Asset';
import type { AssetFactory } from './AssetFactory';
import type { AssetConstructor } from './FactoryRegistry';
import { FactoryRegistry } from './FactoryRegistry';
import type { AssetLoaderContext } from './Loader';
import type { SeamlessAdapter } from './seamless';

/** Stored entry for handler-based asset bindings (via `bindAsset`). */
export interface HandlerEntry {
  load: (config: unknown, ctx: AssetLoaderContext) => Promise<unknown>;
  /** Optional discriminator for in-flight identity keying; overrides source-only default. */
  getIdentityKey?: (config: unknown) => string;
  /** Optional byte-source constructor used by container loading (bypasses fetch). */
  createFromBytes?: (bytes: ArrayBuffer, options?: unknown) => Promise<unknown>;
}

/**
 * Owns constructor-based asset type identification for a {@link Loader}
 * instance: registered factories, type-name and file-extension mappings,
 * `bindAsset` handlers, seamless-adapter bindings, and per-instance type IDs
 * / key derivation. Extracted from `Loader` (Loader split, Slice 1) — every
 * method here is a direct, behavior-preserving relocation.
 */
export class AssetTypeRegistry {
  private readonly _factories = new FactoryRegistry();
  private readonly _assetTypeMap = new Map<string, AssetConstructor>();
  private readonly _typeIds = new WeakMap<AssetConstructor, number>();
  private readonly _handlerFunctions = new Map<AssetConstructor, HandlerEntry>();
  private readonly _extensionMap = new Map<string, AssetConstructor>();
  private readonly _boundHandlers: AssetHandler[] = [];
  private readonly _seamlessAdapters = new Map<AssetConstructor, SeamlessAdapter<unknown>>();
  private _nextTypeId = 1;

  /** Registers a factory for `type`. Prototype-chain aware — see {@link FactoryRegistry}. */
  public register<T>(type: AssetConstructor<T>, factory: AssetFactory<T>): void {
    this._factories.register(type, factory);
  }

  /** Registers the seamless-handle adapter for `type`. One adapter per type. */
  public registerSeamlessAdapter<T>(type: AssetConstructor<T>, adapter: SeamlessAdapter<T>): void {
    if (this._seamlessAdapters.has(type)) {
      throw new Error(`A seamless adapter is already registered for ${this._describeType(type)}.`);
    }

    this._seamlessAdapters.set(type, adapter);
  }

  /**
   * Atomically bind all keys for one AssetBinding to a pre-created handler.
   * Validates all keys BEFORE mutating any map. Any already-registered key
   * throws before any mutation.
   */
  public bindAsset<Result = unknown, Options = undefined>(
    keys: { type: AssetConstructor<Result>; typeNames?: readonly string[]; extensions?: readonly string[]; seamless?: SeamlessAdapter<Result> },
    handler: AssetHandler<Result, Options>,
  ): void {
    const normalizedExts: string[] = [];
    const resolvedNames: string[] = keys.typeNames !== undefined ? [...keys.typeNames] : [];

    // Normalise extension keys
    for (const ext of keys.extensions ?? []) {
      normalizedExts.push(ext.replace(/^\./, '').toLowerCase());
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
    if (this._handlerFunctions.has(keys.type)) {
      throw new Error(`An asset handler is already registered for ${keys.type.name}.`);
    }

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

    // All validation passed — install atomically.
    // Localized type-erasure boundary: the internal registry uses a flat config
    // `{ source, ...fields }`. The public AssetHandler<Result, Options> interface
    // uses `AssetLoadRequest<Options> = { source, options? }`. This single `toRequest`
    // helper is the only place where the erased flat config is cast to the typed
    // request — justified by the `AssetBinding<Result, Options>` contract that
    // associates this handler's Options with the registered constructor.
    const toRequest = (config: unknown): AssetLoadRequest<Options> => {
      const { source, ...rest } = config as { source: string } & Record<string, unknown>;

      if (Object.keys(rest).length === 0) {
        return { source };
      }

      return { source, options: rest as Options };
    };

    const boundIdentityKey = handler.getIdentityKey?.bind(handler);
    const boundCreateFromBytes = handler.createFromBytes?.bind(handler);

    this._handlerFunctions.set(keys.type, {
      load: (config, ctx) => handler.load(toRequest(config), ctx),
      ...(boundIdentityKey && { getIdentityKey: (config: unknown) => boundIdentityKey(toRequest(config)) }),
      ...(boundCreateFromBytes && { createFromBytes: (bytes: ArrayBuffer, options?: unknown) => boundCreateFromBytes(bytes, options as Options) }),
    });

    for (const name of resolvedNames) {
      this._assetTypeMap.set(name, keys.type);
    }

    for (const ext of normalizedExts) {
      this._extensionMap.set(ext, keys.type);
    }

    // Own this handler for lifecycle management. Cast to the erased AssetHandler
    // for storage; destroy() is the only method called on entries in this array.
    this._boundHandlers.push(handler as AssetHandler);

    if (keys.seamless !== undefined) {
      this.registerSeamlessAdapter(keys.type, keys.seamless);
    }
  }

  /** Returns true if a handler or factory is already registered for the given constructor. */
  public hasLoadable(type: AssetConstructor): boolean {
    return this._handlerFunctions.has(type) || this._factories.has(type);
  }

  /** Returns true if a type-name mapping is already registered. */
  public hasAssetType(typeName: string): boolean {
    return this._assetTypeMap.has(typeName);
  }

  /** Returns true if a file extension is already mapped to an asset type. Extension is normalised (leading dot stripped, lower-cased). */
  public hasExtension(ext: string): boolean {
    return this._extensionMap.has(ext.replace(/^\./, '').toLowerCase());
  }

  /** Returns true if a plain `register()` factory exists for `type` (not a `bindAsset` handler). */
  public hasFactory(type: AssetConstructor): boolean {
    return this._factories.has(type);
  }

  /** Resolves the `register()`-based factory for `type`. Throws if none is registered — see {@link FactoryRegistry.resolve}. */
  public resolveFactory<T>(type: AssetConstructor<T>): AssetFactory<T> {
    return this._factories.resolve(type);
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

  /** @internal */
  public _key(type: AssetConstructor, alias: string): string {
    return `${this._getTypeId(type)}:${alias}`;
  }

  /** @internal */
  public _identityKey(type: AssetConstructor, source: string): string {
    return `id:${this._getTypeId(type)}:${source}`;
  }

  /**
   * Resolves the effective identity key for an `Asset<T>` reference. For
   * handler types with `getIdentityKey`, the config-sensitive discriminator
   * is used; otherwise source is the discriminator (same as `_identityKey`).
   * @internal
   */
  public _resolveAssetIdentityKey(type: AssetConstructor, asset: Asset<unknown>): string {
    const rawConfig = asset._config as Record<string, unknown>;
    const handlerEntry = this._handlerFunctions.get(type);
    const discriminator = handlerEntry?.getIdentityKey?.(rawConfig) ?? asset.source;

    return `id:${this._getTypeId(type)}:${discriminator}`;
  }

  /**
   * Resolve the registered asset type for a path by matching the basename's
   * dot-suffixes longest-first: `hero.aseprite.json` tries `aseprite.json`
   * before `json`. Query/hash suffixes are ignored.
   * @internal
   */
  public _resolveExtensionType(path: string): AssetConstructor | undefined {
    const [withoutQueryHash = ''] = path.split(/[?#]/, 1);
    const basename = withoutQueryHash.split('/').pop() ?? '';
    const parts = basename.split('.');

    for (let i = 1; i < parts.length; i++) {
      const ctor = this._extensionMap.get(parts.slice(i).join('.').toLowerCase());

      if (ctor !== undefined) {
        return ctor;
      }
    }

    return undefined;
  }

  /** @internal */
  public _describeType(type: AssetConstructor): string {
    return type.name.length > 0 ? type.name : '(anonymous type)';
  }

  /** Destroys the `register()`-based factory registry. */
  public destroyFactories(): void {
    this._factories.destroy();
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

  /** Destroys the factory registry and every bound handler — see {@link destroyFactories}/{@link destroyHandlers}. */
  public destroy(): void {
    this.destroyFactories();
    this.destroyHandlers();
  }
}
