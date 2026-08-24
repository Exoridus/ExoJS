import type { CacheReadResult } from './CacheReadResult';
import type { CacheRecordKey } from './CacheRecordKey';

/**
 * Physical storage for cache records.
 *
 * A store is asset-agnostic by contract: it never sees an asset type, a
 * factory, a codec or a runtime resource, and it does not decide policy. It is
 * handed a {@link CacheRecordKey} and a structured-clone-compatible value, and
 * its only job is to keep them and hand them back.
 *
 * ## Failures are reported, never swallowed
 *
 * A store must reject when it could not do what it was asked. A missing entry
 * is not a failure - it resolves to a miss. Whether a failure degrades the load
 * or fails it is a {@link CachePolicy} decision, and a store that returns an
 * absent value for a broken database takes that decision away from it.
 *
 * ## Values
 *
 * Values are whatever an {@link AssetSourceCodec} produced as its stored
 * representation. Implementations should accept anything the structured-clone
 * algorithm accepts - strings, `ArrayBuffer`s, typed arrays, `Blob`s, plain
 * objects - rather than constraining callers to one shape.
 * @advanced
 */
export interface CacheStore {
  /**
   * Stable identifier for this store, used in diagnostics to name which store
   * of a multi-store route failed.
   */
  readonly id: string;

  /** Reads one record. Resolves to a miss when it is absent; rejects when the store could not answer. */
  get(key: CacheRecordKey): Promise<CacheReadResult>;

  /**
   * Writes one record, replacing any existing one.
   *
   * Must not resolve before the write is durable in whatever sense the backend
   * offers. A backend with transactions resolves on commit, not on the write
   * request being accepted - otherwise a caller that awaits a write and then
   * reads it back can miss.
   */
  set(key: CacheRecordKey, value: unknown): Promise<void>;

  /** Removes one record. Removing an absent record is not a failure. */
  delete(key: CacheRecordKey): Promise<void>;

  /** Removes every record of `namespace`, or the whole store when it is omitted. */
  clear(namespace?: string): Promise<void>;

  /** Synchronously releases any open handles held by the store. */
  destroy(): void;
}
