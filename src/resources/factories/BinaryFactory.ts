import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/**
 * {@link AssetFactory} implementation that loads arbitrary binary files and
 * exposes them as raw {@link ArrayBuffer} instances.
 *
 * Use this for any binary format that does not have a dedicated factory (e.g.
 * custom data files, packed archives, or proprietary formats).
 */
export class BinaryFactory extends AbstractAssetFactory<ArrayBuffer> {

    public readonly storageName = 'binary';

    /**
     * Reads the full response body as an {@link ArrayBuffer}.
     */
    public async process(response: Response): Promise<ArrayBuffer> {
        return response.arrayBuffer();
    }

    /**
     * Returns the raw buffer unchanged — no further transformation is applied.
     */
    public async create(source: ArrayBuffer): Promise<ArrayBuffer> {
        return source;
    }
}
