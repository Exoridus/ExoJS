import Texture from '../../rendering/texture/Texture';
import { SamplerOptions } from "../../rendering/texture/Sampler";
import { AbstractResourceFactory } from "./AbstractResourceFactory";
import { determineMimeType } from "../../utils/resources";
import { StorageNames } from "../../const/core";

interface TextureFactoryOptions {
    mimeType?: string;
    samplerOptions?: SamplerOptions;
}

export default class TextureFactory extends AbstractResourceFactory<ArrayBuffer, Texture> {

    public readonly storageName: StorageNames = StorageNames.Image;

    async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    async create(source: ArrayBuffer, options: TextureFactoryOptions = {}): Promise<Texture> {
        const { mimeType, samplerOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener('load', () => resolve(new Texture(image, samplerOptions)));
            image.addEventListener('error', () => reject(Error('Error loading image source.')));
            image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

            image.src = this.createObjectURL(blob);
        });
    }
}
