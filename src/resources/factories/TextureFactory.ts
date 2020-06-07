import { Texture } from 'rendering/texture/Texture';
import type { ISamplerOptions } from 'rendering/texture/Sampler';
import { AbstractResourceFactory } from './AbstractResourceFactory';
import { determineMimeType } from 'utils/resources';
import { StorageNames } from 'types/types';

interface ITextureFactoryOptions {
    mimeType?: string;
    samplerOptions?: ISamplerOptions;
}

export class TextureFactory extends AbstractResourceFactory<ArrayBuffer, Texture> {

    public readonly storageName: StorageNames = StorageNames.image;

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: ITextureFactoryOptions = {}): Promise<Texture> {
        const { mimeType, samplerOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener('load', () => resolve(new Texture(image, samplerOptions)));
            image.addEventListener('error', () => reject(Error('Error loading image source.')));
            image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

            image.src = this.createObjectUrl(blob);
        });
    }
}
