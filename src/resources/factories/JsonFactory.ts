import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';

export class JsonFactory extends AbstractAssetFactory<unknown> {

    public readonly storageName = 'json';

    public async process(response: Response): Promise<unknown> {
        return await response.json();
    }

    public async create(source: unknown): Promise<unknown> {
        return source;
    }
}
