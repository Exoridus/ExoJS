import { decodeAudioBuffer, determineMimeType } from '../utils';

/**
 * @class MediaSource
 */
export default class MediaSource {

    /**
     * @constructs MediaSource
     * @param {String} type
     * @param {ArrayBuffer} arrayBuffer
     * @param {Object} [options={}]
     * @param {String} [options.mimeType=determineMimeType(arrayBuffer)]
     * @param {String} [options.loadEvent='canplaythrough']
     */
    constructor(type, arrayBuffer, {
        mimeType = determineMimeType(arrayBuffer),
        loadEvent = 'canplaythrough',
    } = {}) {

        /**
         * @private
         * @member {String}
         */
        this._type = type;

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._arrayBuffer = arrayBuffer;

        /**
         * @private
         * @member {String}
         */
        this._mimeType = mimeType;

        /**
         * @private
         * @member {Blob}
         */
        this._blob = new Blob([arrayBuffer], { type: mimeType });

        /**
         * @private
         * @member {String}
         */
        this._blobURL = URL.createObjectURL(this._blob);

        /**
         * @private
         * @member {String}
         */
        this._loadEvent = loadEvent;

        /**
         * @private
         * @member {?HTMLMediaElement}
         */
        this._mediaElement = null;

        /**
         * @private
         * @member {?AudioBuffer}
         */
        this._audioBuffer = null;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get type() {
        return this._type;
    }

    /**
     * @public
     * @readonly
     * @member {ArrayBuffer}
     */
    get arrayBuffer() {
        return this._arrayBuffer;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get mimeType() {
        return this._mimeType;
    }

    /**
     * @public
     * @readonly
     * @member {Blob}
     */
    get blob() {
        return this._blob;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get blobURL() {
        return this._blobURL;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get loadEvent() {
        return this._loadEvent;
    }

    /**
     * @public
     * @readonly
     * @member {?HTMLMediaElement}
     */
    get mediaElement() {
        return this._mediaElement;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioBuffer}
     */
    get audioBuffer() {
        return this._audioBuffer;
    }

    /**
     * @public
     * @returns {Promise<?HTMLMediaElement>}
     */
    createMediaElement() {
        if (!this._mediaElement) {
            return new Promise((resolve, reject) => {
                const mediaElement = document.createElement(this._type);

                mediaElement.addEventListener(this._loadEvent, () => resolve((this._mediaElement = mediaElement)));
                mediaElement.addEventListener('error', () => reject(Error('Error loading audio source.')));
                mediaElement.addEventListener('abort', () => reject(Error('Audio loading was canceled.')));

                mediaElement.src = this._blobURL;
            });
        }

        return Promise.resolve(this._mediaElement);
    }

    /**
     * @public
     * @returns {Promise<AudioBuffer>}
     */
    decodeAudioBuffer() {
        if (!this._audioBuffer) {
            return decodeAudioBuffer(this._arrayBuffer)
                .then((audioBuffer) => Promise.resolve((this._audioBuffer = audioBuffer)));
        }

        return Promise.resolve(this._audioBuffer);
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        URL.revokeObjectURL(this._blobURL);

        this._type = null;
        this._arrayBuffer = null;
        this._mimeType = null;
        this._blob = null;
        this._blobURL = null;
        this._loadEvent = null;
        this._mediaElement = null;
        this._audioBuffer = null;
    }
}
