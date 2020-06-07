import type { IResourceFactory } from 'types/IResourceFactory';
import type { StorageNames } from 'types/types';

export abstract class AbstractResourceFactory<SourceValue = any, TargetValue = any> implements IResourceFactory<SourceValue, TargetValue> {

    public readonly objectUrls: Array<string> = [];
    public abstract readonly storageName: StorageNames;

    abstract async process(response: Response): Promise<SourceValue>;
    abstract async create(source: SourceValue, options?: object | null): Promise<TargetValue>;

    public createObjectUrl(blob: Blob): string {
        const objectUrl = URL.createObjectURL(blob);

        this.objectUrls.push(objectUrl);

        return objectUrl;
    }

    public destroy(): void {
        for (const objectUrl of this.objectUrls) {
            URL.revokeObjectURL(objectUrl);
        }

        this.objectUrls.length = 0;
    }
}