import type { MockedFunction } from 'vitest';
import { vi } from 'vitest';

import type { CacheContext, CachePolicy } from '#assets/CachePolicy';
import { cacheHit, cacheMiss, type CacheReadResult } from '#assets/CacheReadResult';
import { cacheNamespacePrefix, type CacheRecordKey, serializeCacheRecordKey } from '#assets/CacheRecordKey';
import type { CacheStore } from '#assets/CacheStore';

/**
 * A working in-memory {@link CacheStore} whose every method is a spy, so a test
 * can assert both what was stored and which calls reached the store.
 *
 * Deliberately a real implementation rather than canned return values: the
 * ordering, promotion and identity behaviour under test only shows up when a
 * store actually remembers what it was given.
 */
export interface CacheStoreDouble extends CacheStore {
  /** The records the store currently holds, keyed by their serialized record key. */
  readonly records: Map<string, unknown>;
  get: MockedFunction<CacheStore['get']>;
  set: MockedFunction<CacheStore['set']>;
  delete: MockedFunction<CacheStore['delete']>;
  clear: MockedFunction<CacheStore['clear']>;
  destroy: MockedFunction<CacheStore['destroy']>;
}

export const createCacheStoreDouble = (id = 'double'): CacheStoreDouble => {
  const records = new Map<string, unknown>();

  return {
    id,
    records,
    get: vi.fn((key: CacheRecordKey): Promise<CacheReadResult> => {
      const serialized = serializeCacheRecordKey(key);

      return Promise.resolve(records.has(serialized) ? cacheHit(records.get(serialized)) : cacheMiss);
    }),
    set: vi.fn((key: CacheRecordKey, value: unknown): Promise<void> => {
      records.set(serializeCacheRecordKey(key), value);

      return Promise.resolve();
    }),
    delete: vi.fn((key: CacheRecordKey): Promise<void> => {
      records.delete(serializeCacheRecordKey(key));

      return Promise.resolve();
    }),
    clear: vi.fn((namespace?: string): Promise<void> => {
      if (namespace === undefined) {
        records.clear();
      } else {
        const prefix = cacheNamespacePrefix(namespace);

        for (const key of [...records.keys()]) {
          if (key.startsWith(prefix)) {
            records.delete(key);
          }
        }
      }

      return Promise.resolve();
    }),
    destroy: vi.fn(),
  };
};

/** A policy that records every context it saw and resolves through `resolve`. */
export const createRecordingPolicy = (
  resolve: (context: CacheContext<unknown>) => Promise<unknown> = context => context.fetch(),
): {
  policy: CachePolicy;
  contexts: Array<CacheContext<unknown>>;
  calls: MockedFunction<(context: CacheContext<unknown>) => Promise<unknown>>;
} => {
  const contexts: Array<CacheContext<unknown>> = [];
  const calls = vi.fn((context: CacheContext<unknown>): Promise<unknown> => {
    contexts.push(context);

    return resolve(context);
  });

  return { policy: { resolve: calls } as unknown as CachePolicy, contexts, calls };
};
