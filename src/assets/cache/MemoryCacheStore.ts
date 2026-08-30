import { cacheHit, cacheMiss, type CacheReadResult } from './CacheReadResult';
import { cacheNamespacePrefix, type CacheRecordKey, serializeCacheRecordKey } from './CacheRecordKey';
import type { CacheStore } from './CacheStore';

/**
 * {@link CacheStore} that keeps records in a `Map` for the lifetime of the
 * process.
 *
 * Holds values BY REFERENCE - no cloning, no serialization - so it accepts
 * anything at all and is as fast as a lookup, but does not isolate a caller
 * from later mutation of a stored object and does not survive a reload.
 *
 * Its usual place is in front of a persistent store, where a hit avoids the
 * asynchronous round trip:
 *
 * ```ts
 * new AssetCache({ read: [new MemoryCacheStore(), idb], write: [idb], promote: true })
 * ```
 */
export class MemoryCacheStore implements CacheStore {
  public readonly id: string;

  private readonly _records = new Map<string, unknown>();

  public constructor(id = 'memory') {
    this.id = id;
  }

  public get(key: CacheRecordKey): Promise<CacheReadResult> {
    const serialized = serializeCacheRecordKey(key);

    return Promise.resolve(this._records.has(serialized) ? cacheHit(this._records.get(serialized)) : cacheMiss);
  }

  public set(key: CacheRecordKey, value: unknown): Promise<void> {
    this._records.set(serializeCacheRecordKey(key), value);

    return Promise.resolve();
  }

  public delete(key: CacheRecordKey): Promise<void> {
    this._records.delete(serializeCacheRecordKey(key));

    return Promise.resolve();
  }

  public clear(namespace?: string): Promise<void> {
    if (namespace === undefined) {
      this._records.clear();

      return Promise.resolve();
    }

    const prefix = cacheNamespacePrefix(namespace);

    for (const key of this._records.keys()) {
      if (key.startsWith(prefix)) {
        this._records.delete(key);
      }
    }

    return Promise.resolve();
  }

  public destroy(): void {
    this._records.clear();
  }
}
