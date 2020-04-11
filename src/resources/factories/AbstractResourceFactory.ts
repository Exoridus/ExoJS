import { IResourceFactory } from "../../interfaces/IResourceFactory";
import { StorageNames } from "../../const/core";

export abstract class AbstractResourceFactory<SourceValue = any, TargetValue = any> implements IResourceFactory<SourceValue, TargetValue> {

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