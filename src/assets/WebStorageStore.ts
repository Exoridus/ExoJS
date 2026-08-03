import type { KeyValueStore } from './KeyValueStore';

/** Construction options for {@link WebStorageStore}. */
export interface WebStorageStoreOptions {
  /**
   * Key prefix namespacing this store within the shared Web Storage keyspace, so
   * several stores (and other code) can coexist in one `localStorage`. Default `''`.
   */
  prefix?: string;
}

/**
 * {@link KeyValueStore} over the Web Storage API (`localStorage` or
 * `sessionStorage`).
 *
 * Web Storage holds only strings, so values are JSON-serialized on write and
 * parsed on read — they must be JSON-serializable (**no** Blobs/`ArrayBuffer`s;
 * use {@link IndexedDbKeyValueStore} for those). The backend is synchronous with
 * a small (~5–10 MB) quota; the async interface wraps it so call sites stay
 * uniform across stores. This is the moral successor of the former `JsonStore`:
 * JSON is intrinsic here because the backend can only hold strings.
 *
 * @example
 * ```ts
 * const store = new WebStorageStore(localStorage, { prefix: 'mygame:' });
 * await store.set('slot-1', scene.serialize());
 * const data = await store.get<SerializedScene>('slot-1');
 * if (data) scene.deserialize(data);
 * ```
 */
export class WebStorageStore implements KeyValueStore {
  private readonly _storage: Storage;
  private readonly _prefix: string;

  /** Wrap a `Storage` object (`localStorage`/`sessionStorage`, or a compatible polyfill). */
  public constructor(storage: Storage, options: WebStorageStoreOptions = {}) {
    this._storage = storage;
    this._prefix = options.prefix ?? '';
  }

  public get<T>(key: string): Promise<T | null> {
    const raw = this._storage.getItem(this._prefix + key);

    if (raw === null) {
      return Promise.resolve(null);
    }

    try {
      return Promise.resolve(JSON.parse(raw) as T);
    } catch {
      return Promise.reject(new Error(`WebStorageStore.get() failed: stored value for key "${key}" is not valid JSON.`));
    }
  }

  public set(key: string, value: unknown): Promise<void> {
    let payload: string;

    try {
      payload = JSON.stringify(value);
    } catch {
      return Promise.reject(new Error('WebStorageStore.set() failed: value is not JSON-serializable.'));
    }

    // A full quota throws synchronously (QuotaExceededError); surface it rather
    // than swallow, so the caller knows the write did not persist.
    this._storage.setItem(this._prefix + key, payload);

    return Promise.resolve();
  }

  public has(key: string): Promise<boolean> {
    return Promise.resolve(this._storage.getItem(this._prefix + key) !== null);
  }

  public delete(key: string): Promise<boolean> {
    const fullKey = this._prefix + key;
    const existed = this._storage.getItem(fullKey) !== null;

    this._storage.removeItem(fullKey);

    return Promise.resolve(existed);
  }

  public clear(): Promise<boolean> {
    // Unprefixed: clear the whole storage. Prefixed: remove only our own keys,
    // since the storage may be shared with other stores / app code.
    if (this._prefix === '') {
      this._storage.clear();

      return Promise.resolve(true);
    }

    const ownKeys: string[] = [];

    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);

      if (key?.startsWith(this._prefix) === true) {
        ownKeys.push(key);
      }
    }

    for (const key of ownKeys) {
      this._storage.removeItem(key);
    }

    return Promise.resolve(true);
  }
}
