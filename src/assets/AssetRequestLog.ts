import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { CanonicalAsset, ResourceKey } from './canonicalKey';
import { stableJson, toPortableData } from './portableData';

/** One logical request that resolved to a key, as a saved document can repeat it. */
interface LogicalRequest {
  /** The source the caller wrote, before variant selection. */
  readonly source: string;
  /** The identity-relevant options, as data; absent when the source alone identifies the resource. */
  readonly options?: Readonly<Record<string, unknown>>;
  /** Why the request cannot be repeated from data, when its identity depends on options a document cannot carry. */
  readonly unportable?: string;
}

/**
 * What a saved document can reference a resource by: the one logical request
 * it came from, or why there is no single honest answer.
 * @internal
 */
export type AssetReferenceLookup =
  | { readonly kind: 'request'; readonly source: string; readonly options?: Readonly<Record<string, unknown>> }
  | { readonly kind: 'error'; readonly message: string };

/**
 * The requests that resolved to each canonical key: every source string, for
 * diagnostics, and every distinct logical request (pre-variant source plus
 * identity-relevant options), which backs portable references in saved
 * documents. Neither participates in identity or ownership.
 * @internal
 */
export class AssetRequestLog {
  private readonly _typeRegistry: AssetTypeRegistry;
  private readonly _aliases = new Map<ResourceKey, Set<string>>();
  private readonly _requests = new Map<ResourceKey, Map<string, LogicalRequest>>();

  public constructor(typeRegistry: AssetTypeRegistry) {
    this._typeRegistry = typeRegistry;
  }

  /** Record that `asset`'s source - and, when known, its logical request - resolved to its key. */
  public record(asset: CanonicalAsset): void {
    let aliases = this._aliases.get(asset.key);

    if (aliases === undefined) {
      aliases = new Set<string>();
      this._aliases.set(asset.key, aliases);
    }

    aliases.add(asset.source);

    if (asset.requested === undefined) {
      return;
    }

    const request = this._logicalRequest(asset, asset.requested);
    const id = request.options === undefined ? request.source : `${request.source}\u{0}${stableJson(request.options)}`;
    let requests = this._requests.get(asset.key);

    if (requests === undefined) {
      requests = new Map<string, LogicalRequest>();
      this._requests.set(asset.key, requests);
    }

    if (!requests.has(id)) {
      requests.set(id, request);
    }
  }

  /** Every source that resolved to `key`, sorted; `fallback` alone when none was recorded. */
  public aliases(key: ResourceKey, fallback: string): readonly string[] {
    return Object.freeze([...(this._aliases.get(key) ?? [fallback])].sort());
  }

  /**
   * The single logical request a document can repeat for `key`, an error when
   * several distinct ones resolved to it or the one cannot be written as data,
   * or `fallback` as a bare source when no request was recorded.
   */
  public lookup(key: ResourceKey, fallback: string | undefined): AssetReferenceLookup | null {
    const requests = [...(this._requests.get(key)?.values() ?? [])];

    if (requests.length === 0) {
      return fallback === undefined ? null : { kind: 'request', source: fallback };
    }

    if (requests.length > 1) {
      const names = [...new Set(requests.map(request => `"${request.source}"`))].join(', ');

      return {
        kind: 'error',
        message:
          `An asset was reached through more than one logical source or option set (${names}), so a saved reference to it is ambiguous. ` +
          'Load it through one logical source only, or keep separate resources for separate references.',
      };
    }

    const [request] = requests as [LogicalRequest];

    if (request.unportable !== undefined) {
      return { kind: 'error', message: request.unportable };
    }

    return request.options === undefined
      ? { kind: 'request', source: request.source }
      : { kind: 'request', source: request.source, options: request.options };
  }

  public delete(key: ResourceKey): void {
    this._aliases.delete(key);
    this._requests.delete(key);
  }

  public clear(): void {
    this._aliases.clear();
    this._requests.clear();
  }

  /**
   * The request a document can repeat to reach the same resource: options are
   * kept only when they change the type's identity hooks, and only in the form
   * a document can carry - which must still produce the same identity.
   */
  private _logicalRequest(asset: CanonicalAsset, requested: string): LogicalRequest {
    const { type, source, options } = asset;
    const identity = (candidate: unknown): string =>
      `${this._typeRegistry._identityDiscriminator(type, source, candidate) ?? ''}\u{0}${this._typeRegistry._sourceDiscriminator(type, source, candidate) ?? ''}`;

    if (options === undefined || options === null) {
      return { source: requested };
    }

    const full = identity(options);

    if (full === identity(undefined)) {
      return { source: requested };
    }

    const portable = toPortableData(options);

    if (portable !== null && typeof portable === 'object' && !Array.isArray(portable) && identity(portable) === full) {
      return { source: requested, options: portable as Record<string, unknown> };
    }

    return {
      source: requested,
      unportable: `"${requested}" was loaded with options its type's identity depends on that cannot be written as data (functions, class instances or other non-JSON values).`,
    };
  }
}
