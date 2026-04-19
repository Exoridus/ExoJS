import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

export class TextFactory extends AbstractAssetFactory<string> {

    public readonly storageName = 'text';

    public async process(response: Response): Promise<string> {
        return await response.text();
    }

    public async create(source: string): Promise<string> {
        return source;
    }
}
