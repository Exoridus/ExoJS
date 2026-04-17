export interface Database {
    readonly name: string;
    readonly version: number;
    readonly connected: boolean;

    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
    load<T = unknown>(type: string, name: string): Promise<T | null>;
    save(type: string, name: string, data: unknown): Promise<void>;
    delete(type: string, name: string): Promise<boolean>;
    clearStorage(type: string): Promise<boolean>;
    deleteStorage(): Promise<boolean>;
    destroy(): void;
}
