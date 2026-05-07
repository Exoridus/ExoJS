import { determineMimeType } from '@/resources/utils';
import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

interface ImageFactoryOptions {
    /**
     * MIME type used when constructing the intermediate {@link Blob}. When
     * omitted the type is inferred from the buffer's magic bytes via
     * `determineMimeType`.
     */
    mimeType?: string;
}

/**
 * {@link AssetFactory} implementation that loads PNG, JPG, WebP, AVIF, and
 * other browser-supported raster image formats and produces a decoded
 * {@link HTMLImageElement}.
 *
 * MIME type detection is performed automatically from the buffer's magic bytes;
 * pass an explicit `mimeType` in options to override.
 */
export class ImageFactory extends AbstractAssetFactory<HTMLImageElement> {

    public readonly storageName = 'image';

    /**
     * Reads the full response body as an {@link ArrayBuffer} for MIME-type
     * detection and blob construction.
     */
    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    /**
     * Decodes image bytes into a fully loaded {@link HTMLImageElement}.
     *
     * Creates a temporary object URL from the buffer, assigns it to an
     * `<img>` element, and revokes the URL once loading completes or fails.
     * Rejects if the browser reports a load error or the load is aborted.
     */
    public async create(source: ArrayBuffer, options: ImageFactoryOptions = {}): Promise<HTMLImageElement> {
        const blob = new Blob([source], { type: options.mimeType ?? determineMimeType(source) });
        const objectUrl = this.createObjectUrl(blob);

        return new Promise((resolve, reject) => {
            const image = new Image();
            const finalize = (): void => {
                this.revokeObjectUrl(objectUrl);
            };

            image.addEventListener('load', () => {
                finalize();
                resolve(image);
            }, { once: true });
            image.addEventListener('error', () => {
                finalize();
                reject(Error('Error loading image source.'));
            }, { once: true });
            image.addEventListener('abort', () => {
                finalize();
                reject(Error('Image loading was canceled.'));
            }, { once: true });

            image.src = objectUrl;
        });
    }
}
