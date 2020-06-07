import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from 'types/types';

export class JsonFactory extends AbstractResourceFactory<object, object> {

    public readonly storageName: StorageNames = StorageNames.json;

    public async process(response: Response): Promise<object> {
        return await response.json() as object;
    }

    public async create(source: object): Promise<object> {
        return source;
    }
}
