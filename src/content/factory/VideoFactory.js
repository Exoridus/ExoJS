import BlobFactory from './BlobFactory';
import { determineMimeType } from '../../utils';

/**
 * @class VideoFactory
 * @extends {BlobFactory}
 */
export default class VideoFactory extends BlobFactory {

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
        return 'video';
    }

    /**
     * @override
     */
    create(source, { mimeType = determineMimeType(source), loadEvent = 'canplaythrough' } = {}) {
        return super
            .create(source, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const video = document.createElement('video'),
                    objectURL = URL.createObjectURL(blob);

                this._objectURLs.add(objectURL);

                video.addEventListener(loadEvent, () => resolve(video));
                video.addEventListener('error', () => reject(video));
                video.addEventListener('abort', () => reject(video));

                video.src = objectURL;
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
