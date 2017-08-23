import BlobType from './BlobType';

const URL = window.URL;

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
    loadSource(path, request) {
        return super.loadSource(path, request);
    }

    /**
     * @override
     */
    create(source, { mimeType = 'image/png' } = {}) {
        return super
            .create(source, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const image = new Image();

                image.onload = () => resolve(image);
                image.onerror = () => reject(image);

                image.src = URL.createObjectURL(blob);
            }));
    }
}
