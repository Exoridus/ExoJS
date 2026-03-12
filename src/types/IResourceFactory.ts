import type { StorageNames } from 'types/types';

export interface IResourceFactory<SourceValue = unknown, TargetValue = unknown, Options = unknown> {

    readonly storageName: StorageNames;

    process(response: Response): Promise<SourceValue>;
    create(source: SourceValue, options?: Options): Promise<TargetValue>;
    destroy(): void;
}
