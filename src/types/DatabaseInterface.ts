export interface DatabaseInterface {
    readonly name: string;
    readonly version: number;
    readonly connected: boolean;

    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
    load<T = any>(type: string, name: string): Promise<T>;
    save<T>(type: string, name: string, data: any): Promise<T>;
    delete(type: string, name: string): Promise<boolean>;
    clearStorage(type: string): Promise<boolean>;
    deleteStorage(): Promise<boolean>;
    destroy(): void;
}
