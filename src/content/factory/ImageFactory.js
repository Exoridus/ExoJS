import BlobFactory from './BlobFactory';
import { getMimeType } from '../../utils';

/**
 * @class ImageFactory
 * @extends {ResourceFactory}
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
    create(response, { mimeType = getMimeType(response, 'image') } = {}) {
        return super
            .create(response, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const image = new Image();

                image.addEventListener('load', () => resolve(image));
                image.addEventListener('error', () => reject(image));
                image.addEventListener('abort', () => reject(image));

                image.src = URL.createObjectURL(blob);
            }));
    }
}
