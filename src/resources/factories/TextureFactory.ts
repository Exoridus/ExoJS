import { Texture } from 'rendering/texture/Texture';
import type { SamplerOptions } from 'rendering/texture/Sampler';
import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';
import { determineMimeType } from 'resources/utils';

interface TextureFactoryOptions {
    mimeType?: string;
    samplerOptions?: SamplerOptions;
}

export class TextureFactory extends AbstractAssetFactory<Texture> {

    public readonly storageName = 'texture';

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

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
