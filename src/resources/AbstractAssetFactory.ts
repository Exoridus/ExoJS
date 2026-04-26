import type { AssetFactory } from './AssetFactory';

export abstract class AbstractAssetFactory<T = unknown> implements AssetFactory<T> {

    protected readonly _objectUrls: Array<string> = [];
    public abstract readonly storageName: string;

    abstract process(response: Response): Promise<unknown>;
    abstract create(source: unknown, options?: unknown): Promise<T>;

    public createObjectUrl(blob: Blob): string {
        const objectUrl = URL.createObjectURL(blob);

        this._objectUrls.push(objectUrl);

        return objectUrl;
    }

    protected revokeObjectUrl(objectUrl: string): void {
        URL.revokeObjectURL(objectUrl);

        const index = this._objectUrls.indexOf(objectUrl);

        if (index !== -1) {
            this._objectUrls.splice(index, 1);
        }
    }

    public destroy(): void {
        for (const objectUrl of this._objectUrls) {
            URL.revokeObjectURL(objectUrl);
        }

        this._objectUrls.length = 0;
    }
}
