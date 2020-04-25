import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from "types/types";

export class JSONFactory extends AbstractResourceFactory<object, object> {

    public readonly storageName: StorageNames = StorageNames.Json;

    async process(response: Response): Promise<object> {
        return await response.json() as object;
    }

    async create(source: object): Promise<object> {
        return source;
    }
}
