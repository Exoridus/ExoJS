import BlobFactory from './BlobFactory';
import { determineMimeType } from '../../utils';

/**
 * @class AudioFactory
 * @extends {BlobFactory}
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
    create(source, { mimeType = determineMimeType(source), loadEvent = 'canplaythrough' } = {}) {
        return super
            .create(source, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const audio = document.createElement('audio'),
                    objectURL = URL.createObjectURL(blob);

                this._objectURLs.add(objectURL);

                audio.addEventListener(loadEvent, () => resolve(audio));
                audio.addEventListener('error', () => reject(Error('Error loading audio source.')));
                audio.addEventListener('abort', () => reject(Error('Audio loading was canceled.')));

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
