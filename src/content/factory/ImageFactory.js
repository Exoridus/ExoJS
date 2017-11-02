import BlobFactory from './BlobFactory';
import { determineMimeType } from '../../utils';

/**
 * @class ImageFactory
 * @extends BlobFactory
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
    create(source, { mimeType = determineMimeType(source) } = {}) {
        return super
            .create(source, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const image = new Image(),
                    objectURL = URL.createObjectURL(blob);

                this._objectURLs.add(objectURL);

                image.addEventListener('load', () => resolve(image));
                image.addEventListener('error', () => reject(Error('Error loading image source.')));
                image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

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
