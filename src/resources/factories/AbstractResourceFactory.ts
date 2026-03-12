import type { IResourceFactory } from 'types/IResourceFactory';
import type { StorageNames } from 'types/types';

export abstract class AbstractResourceFactory<SourceValue = unknown, TargetValue = unknown, Options = unknown> implements IResourceFactory<SourceValue, TargetValue, Options> {

    public readonly objectUrls: Array<string> = [];
    public abstract readonly storageName: StorageNames;

    abstract process(response: Response): Promise<SourceValue>;
    abstract create(source: SourceValue, options?: Options): Promise<TargetValue>;

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
