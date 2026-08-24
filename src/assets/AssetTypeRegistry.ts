import type { AssetConstructor } from './AssetConstructor';
import type { AssetTypeName } from './AssetDefinitions';
import type { AssetFactory } from './AssetFactory';
import type { AnyAssetType, AssetLeaf, AssetRequest } from './AssetType';
import { normalizeExtension } from './extensions';
import type { SeamlessAdapter } from './seamless';

/** One asset type as it exists on one {@link Loader}: the descriptor, its dispatch token, and its factory. */
export interface InstalledAssetType {
  readonly type: AnyAssetType;
  /** The constructor loader APIs address this type by - the type's own, or one minted for it. */
  readonly token: AssetConstructor;
  /** Built once at install, torn down with the loader. */
  readonly factory: AssetFactory<unknown, unknown, unknown>;
}

/**
 * A dispatch token for a type that brought no constructor of its own.
 *
 * Residency, claims and diagnostics are keyed by a constructor, so a type
 * without one is given a token at install. It is loader-local and carries no
 * behaviour: what survives a reload is the type's own id.
 */
function mintToken(id: string): AssetConstructor {
  const token = class {};

  // The token appears verbatim in loader diagnostics; an anonymous class would
  // report every such type under the same empty name.
  Object.defineProperty(token, 'name', { value: id, configurable: true });

  return token;
}

/**
 * The asset types installed on one {@link Loader}: what each is called, which
 * suffixes name it, what dispatches to it, and the factory that builds it.
 *
 * Everything here is per-application. Two applications in one process may
 * install different types, and may map the same suffix to different types,
 * without either seeing the other's.
 */
export class AssetTypeRegistry {
  private readonly _byId = new Map<string, InstalledAssetType>();
  private readonly _byToken = new Map<AssetConstructor, InstalledAssetType>();
  /** Suffixes claimed by an installed type. */
  private readonly _extensionTypes = new Map<string, AssetTypeName>();
  /** Explicit app-local overrides, written only by {@link registerType}. */
  private readonly _extensionOverrides = new Map<string, AssetTypeName>();

  /**
   * Installs a set of types, atomically: every key the whole set claims is
   * validated - against each other and against what is already installed -
   * before anything is written, so a rejected set leaves the registry exactly
   * as it was.
   *
   * `createFactory` runs here, which is what makes the mutable half of a type
   * loader-local: a descriptor shared between applications never shares the
   * instance it describes.
   */
  public installAll(assetTypes: readonly AnyAssetType[]): void {
    const pending: Array<{ readonly type: AnyAssetType; readonly token: AssetConstructor; readonly extensions: readonly string[] }> = [];
    const seenIds = new Set<string>();
    const seenTokens = new Set<AssetConstructor>();
    const seenExtensions = new Set<string>();

    for (const type of assetTypes) {
      const { id } = type;

      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`An asset type needs a non-empty string id, got ${JSON.stringify(id)}.`);
      }

      if (seenIds.has(id) || this._byId.has(id)) {
        throw new Error(`Asset type id "${id}" is already installed on this application. An id identifies exactly one type.`);
      }

      seenIds.add(id);

      const extensions = type.extensions.map(normalizeExtension);
      const ownExtensions = new Set<string>();

      for (const extension of extensions) {
        if (ownExtensions.has(extension)) {
          throw new Error(`Asset type "${id}" declares the extension ".${extension}" twice.`);
        }

        ownExtensions.add(extension);

        if (seenExtensions.has(extension) || this._extensionTypes.has(extension)) {
          const owner = this._extensionTypes.get(extension) ?? '(another type in this set)';

          throw new Error(
            `File extension ".${extension}" is already claimed by asset type "${owner}" on this application, so "${id}" cannot claim it too. ` +
              `Use a compound suffix (e.g. "${id}.${extension}") or name individual assets explicitly.`,
          );
        }

        seenExtensions.add(extension);
      }

      // A minted token is fresh per install and can never collide, so only a
      // type that brought its own can conflict.
      const token = type._token ?? mintToken(id);

      if (type._token !== undefined && (seenTokens.has(token) || this._byToken.has(token))) {
        throw new Error(`Asset type "${id}" dispatches on ${this._describeType(token)}, which another installed type already uses.`);
      }

      seenTokens.add(token);
      pending.push({ type, token, extensions });
    }

    for (const { type, token, extensions } of pending) {
      const installed: InstalledAssetType = { type, token, factory: type.createFactory() as AssetFactory<unknown, unknown, unknown> };

      this._byId.set(type.id, installed);
      this._byToken.set(token, installed);

      for (const extension of extensions) {
        this._extensionTypes.set(extension, type.id);
      }
    }
  }

  /** The type installed under `token`, or `undefined`. @internal */
  public getInstalled(token: AssetConstructor): InstalledAssetType | undefined {
    return this._byToken.get(token);
  }

  /** Whether a type is installed under `token`. */
  public hasLoadable(token: AssetConstructor): boolean {
    return this._byToken.has(token);
  }

  /** Whether a type is installed under `name`. */
  public hasAssetType(name: string): boolean {
    return this._byId.has(name);
  }

  /** Whether an installed type claims `extension`. */
  public hasExtension(extension: string): boolean {
    return this._extensionTypes.has(normalizeExtension(extension));
  }

  /** The dispatch token a type name resolves to, or `undefined`. */
  public resolveTypeName(name: string): AssetConstructor | undefined {
    return this._byId.get(name)?.token;
  }

  /** What the type named `name` hands out as a catalog leaf, or `undefined` when no such type is installed. @internal */
  public leafFor(name: string): AssetLeaf<unknown> | undefined {
    return this._byId.get(name)?.type.leaf as AssetLeaf<unknown> | undefined;
  }

  /** The seamless adapter for `token`, or `undefined` when its type hands out something else. */
  public getSeamlessAdapter(token: AssetConstructor): SeamlessAdapter<unknown> | undefined {
    const leaf = this._byToken.get(token)?.type.leaf as AssetLeaf<unknown> | undefined;

    return typeof leaf === 'object' ? leaf : undefined;
  }

  /** Whether the type dispatching on `token` heals its handles in place. */
  public hasSeamlessAdapter(token: AssetConstructor): boolean {
    return typeof this._byToken.get(token)?.type.leaf === 'object';
  }

  /**
   * The identity a resource key names `token` by: the stable id of the type
   * installed under it.
   * @internal
   */
  public _typeIdentity(token: AssetConstructor): string {
    const installed = this._byToken.get(token);

    if (installed === undefined) {
      throw this._missingTypeError(token);
    }

    return installed.type.id;
  }

  /**
   * What the type contributes to a request's resource identity beyond
   * `type + locator`, or `undefined` when the source alone identifies it.
   *
   * The option bag is handed over untouched rather than merged into a flat
   * config: canonicalization runs on every request, so it must not walk (and
   * possibly trip over) properties no type declares as identity-relevant.
   * @internal
   */
  public _identityDiscriminator(token: AssetConstructor, source: string, options?: unknown): string | undefined {
    return this._byToken.get(token)?.type.resourceIdentity?.(request(source, options));
  }

  /**
   * What the type contributes to a request's SOURCE identity, or `undefined`
   * when the locator alone identifies the acquired data.
   * @internal
   */
  public _sourceDiscriminator(token: AssetConstructor, source: string, options?: unknown): string | undefined {
    return this._byToken.get(token)?.type.sourceIdentity?.(request(source, options));
  }

  /**
   * Resolves a whole path to the type that claims it, matching the basename's
   * dot-suffixes longest-first: `hero.aseprite.json` tries `aseprite.json`
   * before `json`. Query and fragment are ignored.
   * @internal
   */
  public _resolveTypeForPath(path: string): AssetTypeName | undefined {
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

  /**
   * Registers an app-local suffix override, which outranks the type that
   * claimed the suffix by declaring it. Overriding a claimed suffix
   * (`registerType('json', 'ldtkMap')`) is the intended use, not a conflict.
   *
   * Idempotent for the same pair; a DIFFERENT override for one suffix throws,
   * because two competing app-wide answers for one suffix are ambiguous.
   */
  public registerType(extension: string, type: AssetTypeName): void {
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

  /** The type a suffix resolves to on this application: the explicit override first, then the type that claimed it. */
  public resolveExtensionType(extension: string): AssetTypeName | undefined {
    const key = normalizeExtension(extension);

    return this._extensionOverrides.get(key) ?? this._extensionTypes.get(key);
  }

  /** @internal */
  public _describeType(token: AssetConstructor): string {
    return token.name.length > 0 ? token.name : '(anonymous type)';
  }

  /**
   * The standard "no type installed" error for `token`, shared by every
   * dispatch path that requires one.
   * @internal
   */
  public _missingTypeError(token: AssetConstructor): Error {
    return new Error(`No asset type is installed for ${this._describeType(token)}. Install it through an extension's "assets" list first.`);
  }

  /** Destroys every installed factory. */
  public destroy(): void {
    for (const installed of this._byId.values()) {
      installed.factory.destroy?.();
    }

    this._byId.clear();
    this._byToken.clear();
    this._extensionTypes.clear();
    this._extensionOverrides.clear();
  }
}

/** The shape an identity hook sees. Options are omitted entirely when the request carried none. */
function request(source: string, options: unknown): AssetRequest<unknown> {
  return options === undefined || options === null ? { source } : { source, options };
}
