import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from "types/types";

export class TextFactory extends AbstractResourceFactory<string, string> {

    public readonly storageName: StorageNames = StorageNames.Text;

    async process(response: Response): Promise<string> {
        return await response.text();
    }

    async create(source: string): Promise<string> {
        return source;
    }
}
