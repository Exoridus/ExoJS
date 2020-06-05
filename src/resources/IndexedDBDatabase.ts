import type { DatabaseInterface } from "types/DatabaseInterface";
import { supportsIndexedDB } from "utils/core";
import { ResourceTypes } from "types/types";

export class IndexedDBDatabase implements DatabaseInterface {

    public readonly name: string;
    public readonly version: number;

    private readonly _onCloseHandler: () => void = this.disconnect.bind(this);
    private _connected = false;
    private _database: IDBDatabase | null = null;

    get connected(): boolean {
        return this._connected;
    }

    constructor(name: string, version: number) {
        if (!supportsIndexedDB) {
            throw new Error('This browser does not support indexedDB!');
        }

        this.name = name;
        this.version = version;
    }

    async getObjectStore(type: ResourceTypes, transactionMode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
        await this.connect();

        return this._database!.transaction([type], transactionMode).objectStore(type);
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const request: IDBOpenDBRequest = indexedDB.open(this.name, this.version);

            request.addEventListener('upgradeneeded', () => {
                const database = request.result;
                const transaction = request.transaction!;
                const currentStores: Array<string> = [...transaction.objectStoreNames];
                const resourceTypeNames: Array<string> = Object.values(ResourceTypes);

                database.addEventListener('error', () => reject(Error('An error occurred while opening the database.')));
                database.addEventListener('abort', () => reject(Error('The database opening was aborted.')));

                for (const store of currentStores) {
                    if (!resourceTypeNames.includes(store)) {
                        database.deleteObjectStore(store);
                    }
                }

                for (const type of resourceTypeNames) {
                    if (!currentStores.includes(type)) {
                        database.createObjectStore(type, { keyPath: 'name' });
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

    async disconnect(): Promise<boolean> {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.removeEventListener('versionchange', this._onCloseHandler);
            this._database.close();
            this._database = null;
            this._connected = false;
        }

        return true;
    }

    async load<T>(type: ResourceTypes, name: string): Promise<T> {
        const store = await this.getObjectStore(type);

        return new Promise((resolve, reject) => {
            const request = store.get(name);

            request.addEventListener('success', () => resolve(request.result?.data || null));
            request.addEventListener('error', () => reject(Error('An error occurred while loading an item.')));
        });
    }

    async save<T>(type: ResourceTypes, name: string, data: any): Promise<T> {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.put({ name, data });

            request.addEventListener('success', () => resolve());
            request.addEventListener('error', () => reject(Error('An error occurred while saving an item.')));
        });
    }

    async delete(type: ResourceTypes, name: string): Promise<boolean> {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.delete(name);

            request.addEventListener('success', () => resolve(true));
            request.addEventListener('error', () => reject(Error('An error occurred while deleting an item.')));
        });
    }

    async clearStorage(type: ResourceTypes): Promise<boolean> {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.clear();

            request.addEventListener('success', () => resolve(true));
            request.addEventListener('error', () => reject(Error('An error occurred while clearing a storage.')));
        });
    }

    async deleteStorage(): Promise<boolean> {
        await this.disconnect();

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.name);

            request.addEventListener('success', () => resolve());
            request.addEventListener('error', () => reject(Error('An error occurred while deleting a storage.')));
        });
    }

    destroy() {
        this.disconnect();
        this._database = null;
    }
}
