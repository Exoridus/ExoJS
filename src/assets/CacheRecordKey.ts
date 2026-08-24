import type { SourceKey } from './canonicalKey';

/**
 * The identity of one persisted cache record.
 *
 * A {@link SourceKey} alone is deliberately not enough. It carries no asset
 * type - two types may acquire one URL and keep entirely different
 * representations of it - and it says nothing about the layout that wrote the
 * record. Both belong in the persistent identity, or a store would serve one
 * type's representation to another, and a layout change would decode data it
 * no longer understands.
 * @advanced
 */
export interface CacheRecordKey {
  /** The storage namespace, which is the asset type's stable `id`. */
  readonly namespace: string;
  /** The source identity the record was acquired for. */
  readonly source: SourceKey;
  /** The {@link CacheLayout} version that wrote it. */
  readonly version: number;
  /** Which of the layout's records this is. */
  readonly record: string;
}

/**
 * Escape the field separator and the escape character itself, so no
 * combination of namespace and record name can spell another key.
 */
function escape(value: string): string {
  return value.includes('%') || value.includes('|') ? value.replaceAll('%', '%25').replaceAll('|', '%7C') : value;
}

/**
 * The string a {@link CacheStore} persists a record under.
 *
 * Composed of stable values only - never object identity, a constructor name a
 * minifier may rewrite, or an install ordinal - so a record written in one
 * session is found again in the next.
 *
 * The source key comes last and is left unescaped: it is the only field that
 * may contain a separator, and nothing follows it to be confused with. That
 * also puts every record of one namespace in one contiguous key range, which
 * is what lets a store clear a namespace without an index.
 * @advanced
 */
export function serializeCacheRecordKey(key: CacheRecordKey): string {
  return `${escape(key.namespace)}|${key.version}|${escape(key.record)}|${key.source}`;
}

/**
 * The key prefix every record of `namespace` shares.
 * @advanced
 */
export function cacheNamespacePrefix(namespace: string): string {
  return `${escape(namespace)}|`;
}
