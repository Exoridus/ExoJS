import { IndexedDbStore, type IndexedDbStoreOptions } from './IndexedDbStore';

export interface JsonStoreOptions extends Omit<IndexedDbStoreOptions, 'storeNames'> {
  storeName?: string;
}

const defaultDatabaseName = 'exojs-json-store';
const defaultStoreName = '__json_store';

/**
 * JSON-first key-value store built on top of {@link IndexedDbStore}.
 */
export class JsonStore {
  private readonly _storageName: string;
  private readonly _store: IndexedDbStore;

  public constructor(nameOrOptions: string | JsonStoreOptions = defaultDatabaseName) {
    const options = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;
    const storageName = options.storeName ?? defaultStoreName;

    this._storageName = storageName;
    this._store = new IndexedDbStore({
      name: options.name,
      version: options.version,
      migrations: options.migrations,
      storeNames: [storageName],
    });
  }

  public async set(key: string, data: unknown): Promise<void> {
    let payload: string;

    try {
      payload = JSON.stringify(data);
    } catch {
      throw new Error('JsonStore.set() failed: data is not JSON-serializable.');
    }

    await this._store.save(this._storageName, key, payload);
  }

  public async get<T = unknown>(key: string): Promise<T | null> {
    const payload = await this._store.load(this._storageName, key);

    if (payload === null) {
      return null;
    }

    if (typeof payload !== 'string') {
      throw new Error('JsonStore.get() failed: stored payload is not a JSON string.');
    }

    try {
      return JSON.parse(payload) as T;
    } catch {
      throw new Error(`JsonStore.get() failed: invalid JSON payload for key "${key}".`);
    }
  }

  public async delete(key: string): Promise<boolean> {
    return this._store.delete(this._storageName, key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  public async clear(): Promise<boolean> {
    return this._store.clear(this._storageName);
  }

  public destroy(): void {
    this._store.destroy();
  }
}
