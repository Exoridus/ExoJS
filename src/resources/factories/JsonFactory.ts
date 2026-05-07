import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/**
 * {@link AssetFactory} implementation that parses JSON files and exposes them
 * as plain JavaScript values.
 *
 * The parsed value is typed as `unknown`; callers are expected to narrow or
 * cast the result to their specific schema type.
 */
export class JsonFactory extends AbstractAssetFactory<unknown> {

    public readonly storageName = 'json';

    /**
     * Parses the response body as JSON and returns the resulting value.
     */
    public async process(response: Response): Promise<unknown> {
        return await response.json();
    }

    /**
     * Returns the already-parsed value unchanged.
     */
    public async create(source: unknown): Promise<unknown> {
        return source;
    }
}
