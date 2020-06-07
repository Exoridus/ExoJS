import { determineMimeType } from 'utils/resources';
import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from 'types/types';

interface IImageFactoryOptions {
    mimeType?: string;
}

export class ImageFactory extends AbstractResourceFactory<ArrayBuffer, HTMLImageElement> {

    public readonly storageName: StorageNames = StorageNames.image;

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: IImageFactoryOptions = {}): Promise<HTMLImageElement> {
        const blob = new Blob([source], { type: options.mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener('load', () => resolve(image));
            image.addEventListener('error', () => reject(Error('Error loading image source.')));
            image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

            image.src = this.createObjectUrl(blob);
        });
    }
}
