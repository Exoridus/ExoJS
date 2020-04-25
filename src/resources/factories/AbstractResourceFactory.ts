import { ResourceFactoryInterface } from "types/ResourceFactoryInterface";
import { StorageNames } from "types/types";

export abstract class AbstractResourceFactory<SourceValue = any, TargetValue = any> implements ResourceFactoryInterface<SourceValue, TargetValue> {

    public readonly objectURLs: Array<string> = [];
    public abstract readonly storageName: StorageNames;

    abstract async process(response: Response): Promise<SourceValue>;
    abstract async create(source: SourceValue, options?: object | null): Promise<TargetValue>;

    createObjectURL(blob: Blob): string {
        const objectURL = URL.createObjectURL(blob);

        this.objectURLs.push(objectURL);

        return objectURL;
    }

    destroy() {
        for (const objectURL of this.objectURLs) {
            URL.revokeObjectURL(objectURL);
        }

        this.objectURLs.length = 0;
    }
}