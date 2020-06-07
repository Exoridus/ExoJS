import type { StorageNames } from 'types/types';

export interface IResourceFactory<SourceValue = any, TargetValue = any> {

    readonly storageName: StorageNames;

    process(response: Response): Promise<SourceValue>;
    create(source: SourceValue, options?: object | null): Promise<TargetValue>;
    destroy(): void;
}
