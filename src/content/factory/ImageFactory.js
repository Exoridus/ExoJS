import BlobFactory from './BlobFactory';
import { getMimeType } from '../../utils';

/**
 * @class ImageFactory
 * @extends {ResourceFactory}
 */
export default class ImageFactory extends BlobFactory {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Set<String>}
         */
        this._objectURLs = new Set();
    }

    /**
     * @public
     * @readonly
     * @member {Set<String>}
     */
    get objectURLs() {
        return this._objectURLs;
    }

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
                const image = new Image(),
                    objectURL = URL.createObjectURL(blob);

                this._objectURLs.add(objectURL);

                image.addEventListener('load', () => resolve(image));
                image.addEventListener('error', () => reject(image));
                image.addEventListener('abort', () => reject(image));

                image.src = objectURL;
            }));
    }

    /**
     * @override
     */
    destroy() {
        for (const objectURL of this._objectURLs) {
            URL.revokeObjectURL(objectURL);
        }

        this._objectURLs.clear();
        this._objectURLs = null;
    }
}
