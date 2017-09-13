import BlobFactory from './BlobFactory';
import { getMimeType } from '../../utils';

/**
 * @class AudioFactory
 * @extends {ResourceFactory}
 */
export default class AudioFactory extends BlobFactory {

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
        return 'audio';
    }

    /**
     * @override
     */
    create(response, { mimeType = getMimeType(response, 'audio'), loadEvent = 'canplaythrough' } = {}) {
        return super
            .create(response, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const audio = document.createElement('audio'),
                    objectURL = URL.createObjectURL(blob);

                this._objectURLs.add(objectURL);

                audio.addEventListener(loadEvent, () => resolve(audio));
                audio.addEventListener('error', () => reject(audio));
                audio.addEventListener('abort', () => reject(audio));

                audio.src = objectURL;
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
