import type { Database } from 'resources/Database';
import { supportsIndexedDb } from 'core/utils';

const defaultStoreNames: ReadonlyArray<string> = [
    'font', 'video', 'music', 'sound', 'image', 'texture',
    'text', 'svg', 'json', 'binary', 'wasm', 'vtt',
];

export class IndexedDbDatabase implements Database {

    public readonly name: string;
    public readonly version: number;

    private readonly _storeNames: ReadonlyArray<string>;
    private readonly _migrations: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean> | undefined;
    private readonly _onCloseHandler: () => void = this.disconnect.bind(this);
    private _connected = false;
    private _database: IDBDatabase | null = null;

    public get connected(): boolean {
        return this._connected;
    }

    public constructor(
        name: string,
        version: number = 1,
        storeNames: ReadonlyArray<string> = defaultStoreNames,
        migrations?: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean>,
    ) {
        if (!supportsIndexedDb) {
            throw new Error('This browser does not support indexedDB!');
        }

        this.name = name;
        this.version = version;
        this._storeNames = storeNames;
        this._migrations = migrations;
    }

    public async getObjectStore(type: string, transactionMode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
        await this.connect();

        return this._database!.transaction([type], transactionMode).objectStore(type);
    }

    public async connect(): Promise<boolean> {
        if (this._connected && this._database) {
            return true;
        }

        return new Promise((resolve, reject) => {
            const request: IDBOpenDBRequest = indexedDB.open(this.name, this.version);

            request.addEventListener('upgradeneeded', (event) => {
                const database = request.result;
                const transaction = request.transaction!;
                const currentStores: Array<string> = [...transaction.objectStoreNames];
                const { oldVersion, newVersion } = event as IDBVersionChangeEvent;

                database.addEventListener('error', () => reject(Error('An error occurred while opening the database.')));
                database.addEventListener('abort', () => reject(Error('The database opening was aborted.')));

                if (this._migrations) {
                    const migrationKeys = Object.keys(this._migrations)
                        .map(Number)
                        .filter(v => v > oldVersion && v <= (newVersion ?? this.version))
                        .sort((a, b) => a - b);

                    for (const v of migrationKeys) {
                        const ok = this._migrations[v](database, transaction);

                        if (!ok) {
                            transaction.abort();
                            return;
                        }
                    }
                } else {
                    for (const store of currentStores) {
                        if (!this._storeNames.includes(store)) {
                            database.deleteObjectStore(store);
                        }
                    }

                    for (const name of this._storeNames) {
                        if (!currentStores.includes(name)) {
                            database.createObjectStore(name, { keyPath: 'name' });
                        }
                    }
                }
            });

            request.addEventListener('success', () => {
                this._database = request.result;
                this._database.addEventListener('close', this._onCloseHandler);
                this._database.addEventListener('versionchange', this._onCloseHandler);
                this._connected = true;

                resolve(true);
            });

            request.addEventListener('error', () => reject(Error('An error occurred while requesting the database connection.')));
            request.addEventListener('blocked', () => reject(Error('The request for the database connection has been blocked.')));
        });
    }

    public async disconnect(): Promise<boolean> {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.removeEventListener('versionchange', this._onCloseHandler);
            this._database.close();
            this._database = null;
            this._connected = false;
        }

        return true;
    }

    public async load<T = unknown>(type: string, name: string): Promise<T | null> {
        const store = await this.getObjectStore(type);

        return new Promise((resolve, reject) => {
            const request = store.get(name);

            request.addEventListener('success', () => resolve(request.result?.data ?? null));
            request.addEventListener('error', () => reject(Error('An error occurred while loading an item.')));
        });
    }

    public async save(type: string, name: string, data: unknown): Promise<void> {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.put({ name, data });

            request.addEventListener('success', () => resolve());
            request.addEventListener('error', () => reject(Error('An error occurred while saving an item.')));
        });
    }

    public async delete(type: string, name: string): Promise<boolean> {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.delete(name);

            request.addEventListener('success', () => resolve(true));
            request.addEventListener('error', () => reject(Error('An error occurred while deleting an item.')));
        });
    }

    public async clearStorage(type: string): Promise<boolean> {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.clear();

            request.addEventListener('success', () => resolve(true));
            request.addEventListener('error', () => reject(Error('An error occurred while clearing a storage.')));
        });
    }

    public async deleteStorage(): Promise<boolean> {
        await this.disconnect();

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.name);

            request.addEventListener('success', () => resolve(true));
            request.addEventListener('error', () => reject(Error('An error occurred while deleting a storage.')));
        });
    }

    public destroy(): void {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.removeEventListener('versionchange', this._onCloseHandler);
            this._database.close();
        }
        this._database = null;
        this._connected = false;
    }
}
