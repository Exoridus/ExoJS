import BlobType from './BlobType';

/**
 * @class ImageType
 * @memberof Exo
 * @extends {Exo.BlobType}
 * @implements {Exo.ResourceType}
 */
export default class ImageType extends BlobType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return super.loadSource(path);
    }

    /**
     * @override
     * @param {ArrayBuffer} source
     * @param {String} type
     * @returns {Promise}
     */
    create(source, type = 'image/png') {
        return super.create(source, type).then((blob) => new Promise((resolve, reject) => {
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = () => reject(image);

            image.src = window.URL.createObjectURL(blob);
        }));
    }
}
