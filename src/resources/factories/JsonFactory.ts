import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from 'types/types';

export class JsonFactory extends AbstractResourceFactory<Record<string, unknown>, Record<string, unknown>> {

    public readonly storageName: StorageNames = StorageNames.json;

    public async process(response: Response): Promise<Record<string, unknown>> {
        return await response.json() as Record<string, unknown>;
    }

    public async create(source: Record<string, unknown>): Promise<Record<string, unknown>> {
        return source;
    }
}
