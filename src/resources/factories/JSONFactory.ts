import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from "../../const/core";

export default class JSONFactory extends AbstractResourceFactory<object, object> {

    public readonly storageName: StorageNames = StorageNames.Json;

    async process(response: Response): Promise<object> {
        return await response.json() as object;
    }

    async create(source: object): Promise<object> {
        return source;
    }
}
