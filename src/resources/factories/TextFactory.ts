import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from 'types/types';

export class TextFactory extends AbstractResourceFactory<string, string> {

    public readonly storageName: StorageNames = StorageNames.text;

    public async process(response: Response): Promise<string> {
        return await response.text();
    }

    public async create(source: string): Promise<string> {
        return source;
    }
}
