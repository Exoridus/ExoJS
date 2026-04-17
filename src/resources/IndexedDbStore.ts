import type { CacheStore } from './CacheStore';
import { IndexedDbDatabase } from './IndexedDbDatabase';

export interface IndexedDbStoreOptions {
    name: string;
    version?: number;
    storeNames?: ReadonlyArray<string>;
    migrations?: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean>;
}

export class IndexedDbStore implements CacheStore {

    private readonly _db: IndexedDbDatabase;

    public constructor(nameOrOptions: string | IndexedDbStoreOptions) {
        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : nameOrOptions;

        this._db = new IndexedDbDatabase(
            options.name,
            options.version ?? 1,
            options.storeNames ?? [
                'font', 'video', 'music', 'sound', 'image', 'texture',
                'text', 'svg', 'json', 'binary', 'wasm', 'vtt',
            ],
            options.migrations,
        );
    }

    public async load(storageName: string, key: string): Promise<unknown | null> {
        return this._db.load(storageName, key);
    }

    public async save(storageName: string, key: string, data: unknown): Promise<void> {
        return this._db.save(storageName, key, data);
    }

    public async delete(storageName: string, key: string): Promise<boolean> {
        return this._db.delete(storageName, key);
    }

    public async clear(storageName: string): Promise<boolean> {
        return this._db.clearStorage(storageName);
    }

    public destroy(): void {
        this._db.destroy();
    }
}
