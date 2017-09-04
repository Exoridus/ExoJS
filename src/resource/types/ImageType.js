import BlobType from './BlobType';
import {getMimeType} from '../../utils';

/**
 * @class ImageType
 * @extends {Exo.BlobType}
 * @memberof Exo
 */
export default class ImageType extends BlobType {

    /**
     * @override
     */
    get storageKey() {
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

                image.src = window.URL.createObjectURL(blob);
            }));
    }
}
