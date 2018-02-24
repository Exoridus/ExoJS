import BlobFactory from './BlobFactory';

/**
 * @class ImageFactory
 * @extends BlobFactory
 */
export default class ImageFactory extends BlobFactory {


    /**
     * @override
     */
    get storageType() {
        return 'image';
    }

    /**
     * @override
     */
    async create(source, { mimeType } = {}) {
        const blob = await super.create(source, { mimeType });

        return new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener('load', () => resolve(image));
            image.addEventListener('error', () => reject(Error('Error loading image source.')));
            image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

            image.src = this.createObjectURL(blob);
        });
    }
}
