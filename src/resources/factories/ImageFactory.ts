import { determineMimeType } from 'resources/utils';
import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';

interface ImageFactoryOptions {
    mimeType?: string;
}

export class ImageFactory extends AbstractAssetFactory<HTMLImageElement> {

    public readonly storageName = 'image';

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

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
