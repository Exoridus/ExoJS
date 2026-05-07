import { Texture } from '@/rendering/texture/Texture';
import type { SamplerOptions } from '@/rendering/texture/Sampler';
import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';
import { determineMimeType } from '@/resources/utils';

/** Construction options for {@link TextureFactory.create}. */
export interface TextureFactoryOptions {
    /**
     * MIME type for the intermediate blob. Inferred from magic bytes when
     * omitted.
     */
    mimeType?: string;
    /** Sampler parameters (wrap mode, filter, etc.) forwarded to the {@link Texture} constructor. */
    samplerOptions?: SamplerOptions;
}

/**
 * {@link AssetFactory} implementation that loads PNG, JPG, WebP, AVIF, and
 * other browser-supported raster image formats and produces a GPU-ready
 * {@link Texture} instance.
 *
 * MIME type detection is performed automatically from the buffer's magic bytes;
 * pass an explicit `mimeType` to override. Sampler state (wrap, filter, etc.)
 * can be configured via `samplerOptions`.
 */
export class TextureFactory extends AbstractAssetFactory<Texture> {

    public readonly storageName = 'texture';

    /**
     * Reads the full response body as an {@link ArrayBuffer} for MIME-type
     * detection and blob construction.
     */
    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    /**
     * Decodes image bytes into a fully loaded {@link HTMLImageElement} and
     * wraps it in a {@link Texture} with the given sampler options.
     *
     * Creates a temporary object URL, resolves when the image's `load` event
     * fires, and revokes the URL regardless of outcome.
     */
    public async create(source: ArrayBuffer, options: TextureFactoryOptions = {}): Promise<Texture> {
        const { mimeType, samplerOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });
        const objectUrl = this.createObjectUrl(blob);

        return new Promise((resolve, reject) => {
            const image = new Image();
            const finalize = (): void => {
                this.revokeObjectUrl(objectUrl);
            };

            image.addEventListener('load', () => {
                finalize();
                resolve(new Texture(image, samplerOptions));
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
