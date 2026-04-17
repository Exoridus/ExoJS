import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';

export class BinaryFactory extends AbstractAssetFactory<ArrayBuffer> {

    public readonly storageName = 'binary';

    public async process(response: Response): Promise<ArrayBuffer> {
        return response.arrayBuffer();
    }

    public async create(source: ArrayBuffer): Promise<ArrayBuffer> {
        return source;
    }
}
