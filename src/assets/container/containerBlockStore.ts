/**
 * Where a reader keeps container blocks between visits.
 *
 * A block is addressed by its hash, never by the pack it came from, so two
 * packs that share a block share the stored entry - which is what makes an
 * update cost only the blocks whose contents actually changed.
 *
 * Every method may fail or answer nothing without that being an error: a store
 * is an optimisation, and a reader that gets nothing back simply fetches.
 */
export interface ContainerBlockStore {
  /** The stored bytes for `hash`, or `undefined` when the store does not hold them. */
  get(hash: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  /** Offer `bytes` for `hash`. A store is free to decline, evict, or ignore the offer. */
  put(hash: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Origin of the synthetic request a block is stored under.
 *
 * The Cache API keys on a request URL, so a block needs one. It is deliberately
 * not a real address: nothing is ever fetched from it, and no server has to
 * know it exists.
 */
const BLOCK_ORIGIN = 'https://exojs.invalid/container-block/';

const blockRequest = (hash: string): string => `${BLOCK_ORIGIN}${hash}`;

/** The name {@link cacheApiBlockStore} opens when the caller names none. */
export const DEFAULT_BLOCK_CACHE_NAME = 'exojs-container-blocks';

/**
 * A {@link ContainerBlockStore} over the Cache API.
 *
 * Per-origin and evictable, which is what a block store wants: the browser may
 * reclaim the space at any time and the only cost is a refetch. Storage is
 * opened lazily on first use, so constructing one costs nothing and an
 * environment without `caches` (a non-secure context, a worker without the API,
 * Node) degrades to a store that holds nothing rather than throwing.
 */
export const cacheApiBlockStore = (cacheName: string = DEFAULT_BLOCK_CACHE_NAME): ContainerBlockStore => {
  let opening: Promise<Cache | null> | null = null;

  const open = (): Promise<Cache | null> => {
    // Cached as the PROMISE rather than the cache: concurrent first reads would
    // otherwise each open storage, and the failure has to be remembered too or
    // every miss re-attempts an API that is not there.
    opening ??= (async () => {
      try {
        return typeof caches === 'undefined' ? null : await caches.open(cacheName);
      } catch {
        return null;
      }
    })();

    return opening;
  };

  return {
    get: async hash => {
      const cache = await open();

      // A storage bucket that is gone, blocked or throwing answers nothing,
      // which is a miss rather than a failure - the block is fetched instead.
      const hit = cache === null ? null : await cache.match(blockRequest(hash)).catch(() => null);

      return hit === null || hit === undefined ? undefined : new Uint8Array(await hit.arrayBuffer());
    },
    put: async (hash, bytes) => {
      const cache = await open();

      if (cache === null) return;

      try {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- an HTTP header name, not an identifier
        const headers = { 'Content-Type': 'application/octet-stream' };

        // Copied through the constructor, not spread: a view into a larger
        // buffer would otherwise hand the Response whatever else that buffer
        // holds, and spreading would turn the bytes into a list of numbers.
        await cache.put(blockRequest(hash), new Response(new Uint8Array(bytes), { headers }));
      } catch {
        // A full or disabled storage bucket is the ordinary case here, not a
        // failure worth reporting: the block is simply fetched again next time.
      }
    },
  };
};
