import { IndexedDbStore, type IndexedDbStoreOptions } from './IndexedDbStore';

export interface SaveStoreOptions extends Omit<IndexedDbStoreOptions, 'storeNames'> {
  storeName?: string;
}

const defaultDatabaseName = 'exojs-save-store';
const defaultStoreName = '__save_store';

/**
 * JSON-first save-data store built on top of {@link IndexedDbStore}.
 *
 * Uses a dedicated IndexedDB object store and persists JSON payloads by key.
 * Intended for user-facing save data (settings, profiles, checkpoints, etc.).
 */
export class SaveStore {
  private readonly _storageName: string;
  private readonly _store: IndexedDbStore;

  public constructor(nameOrOptions: string | SaveStoreOptions = defaultDatabaseName) {
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

  public async save(key: string, data: unknown): Promise<void> {
    let payload: string;

    try {
      payload = JSON.stringify(data);
    } catch {
      throw new Error('SaveStore.save() failed: data is not JSON-serializable.');
    }

    await this._store.save(this._storageName, key, payload);
  }

  public async load<T = unknown>(key: string): Promise<T | null> {
    const payload = await this._store.load(this._storageName, key);

    if (payload === null) {
      return null;
    }

    if (typeof payload !== 'string') {
      throw new Error('SaveStore.load() failed: stored payload is not a JSON string.');
    }

    try {
      return JSON.parse(payload) as T;
    } catch {
      throw new Error(`SaveStore.load() failed: invalid JSON payload for key "${key}".`);
    }
  }

  public async delete(key: string): Promise<boolean> {
    return this._store.delete(this._storageName, key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.load(key)) !== null;
  }

  public async clear(): Promise<boolean> {
    return this._store.clear(this._storageName);
  }

  public destroy(): void {
    this._store.destroy();
  }
}
