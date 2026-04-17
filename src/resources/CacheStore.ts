export interface CacheStore {
    load(storageName: string, key: string): Promise<unknown | null>;
    save(storageName: string, key: string, data: unknown): Promise<void>;
    delete(storageName: string, key: string): Promise<boolean>;
    clear(storageName: string): Promise<boolean>;
    destroy(): void;
}
