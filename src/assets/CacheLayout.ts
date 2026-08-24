import type { CacheReadResult } from './CacheReadResult';

/**
 * The store operations a {@link CacheLayout} may use, scoped to one
 * acquisition.
 *
 * A layout addresses its own records by name and never composes a
 * {@link CacheRecordKey} itself: the namespace, the source identity and the
 * layout version are the cache's to own, and a layout that could choose them
 * could collide with another type's records.
 * @advanced
 */
export interface CacheLayoutContext {
  /** Read one of this layout's records. Rejects when the store could not answer. */
  read(record: string): Promise<CacheReadResult>;
  /** Write one of this layout's records. */
  write(record: string, value: unknown): Promise<void>;
}

/**
 * How one acquired representation is laid out in persistent storage.
 *
 * This is the boundary between what an asset's source data IS - the asset
 * type's and its codec's business - and how a store physically holds it. A
 * layout decides how many records a representation occupies, what they are
 * called, and how a complete representation is reassembled from them. It knows
 * nothing about IndexedDB, network ordering or resource construction.
 *
 * ## Versioning
 *
 * {@link version} is part of every record's persistent identity, so raising it
 * makes previously written records unreachable rather than decoding them under
 * rules they were not written for. There is no migration path by design: a
 * cache is reconstructible, and a version bump simply misses and re-acquires.
 *
 * Most types need exactly one record and should use {@link SingleEntryLayout}.
 * @advanced
 */
export interface CacheLayout<Stored> {
  /** The layout version, part of every record key this layout reads or writes. */
  readonly version: number;

  /**
   * Reassemble the complete stored representation.
   *
   * Must resolve to a miss unless every record the representation needs was
   * present: a partially written representation is not a hit.
   */
  read(context: CacheLayoutContext): Promise<CacheReadResult<Stored>>;

  /** Persist `stored` across this layout's records. */
  write(stored: Stored, context: CacheLayoutContext): Promise<void>;
}
