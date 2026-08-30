import type { SourceKey } from '#assets/canonicalKey';

/**
 * Raised when a cache-only acquisition found no record.
 *
 * A distinct type from {@link AssetCacheError} on purpose: an absent entry is
 * the cache working correctly and reporting that it has nothing, while an
 * `AssetCacheError` means a store could not answer at all. Only the second is
 * a reason to suspect the storage backend.
 */
export class AssetCacheMissError extends Error {
  /** The storage namespace that was searched. */
  public readonly namespace: string;
  /** The source identity that was not found. */
  public readonly sourceKey: SourceKey;

  public constructor(namespace: string, source: SourceKey) {
    super(`No cached representation of "${source}" in namespace "${namespace}".`);

    this.name = 'AssetCacheMissError';
    this.namespace = namespace;
    this.sourceKey = source;
  }
}
