export interface AssetFactory<T = unknown> {
    readonly storageName: string;

    process(response: Response): Promise<unknown>;
    create(source: unknown, options?: unknown): Promise<T>;
    destroy(): void;
}
