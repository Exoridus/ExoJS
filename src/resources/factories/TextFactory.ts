import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from "../../const/core";

export default class TextFactory extends AbstractResourceFactory<string, string> {

    public readonly storageName: StorageNames = StorageNames.Text;

    async process(response: Response): Promise<string> {
        return await response.text();
    }

    async create(source: string): Promise<string> {
        return source;
    }
}
