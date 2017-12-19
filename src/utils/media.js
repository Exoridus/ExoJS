import support from '../support';

const

    /**
     * @inner
     * @constant
     * @type {Audio}
     */
    audio = new Audio(),

    /**
     * @public
     * @constant
     * @name audioContext
     * @type {AudioContext}
     */
    audioContext = support.webAudio ? new AudioContext() : null,

    /**
     * @inner
     * @type {HTMLCanvasElement}
     */
    canvas = document.createElement('canvas'),

    /**
     * @inner
     * @type {CanvasRenderingContext2D}
     */
    canvasContext = canvas.getContext('2d'),

    /**
     * @inner
     * @type {RegExp}
     */
    CODEC_NOT_SUPPORTED = /^no$/,

    /**
     * @public
     * @param {...String} codecs
     * @returns {Boolean}
     */
    supportsCodec = (...codecs) => {
        for (const codec of codecs) {
            if (audio.canPlayType(codec).replace(CODEC_NOT_SUPPORTED, '')) {
                return true;
            }
        }

        return false;
    },

    /**
     * @public
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<AudioBuffer>}
     */
    decodeAudioBuffer = (arrayBuffer) => {
        if (!support.webAudio) {
            return Promise.reject(Error('Web Audio is not supported!'));
        }

        return new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        });
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
     * @returns {Number}
     */
    getMediaWidth = (element) => (element && (element.naturalWidth || element.videoWidth || element.width)) || 0,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
     * @returns {Number}
     */
    getMediaHeight = (element) => (element && (element.naturalHeight || element.videoHeight || element.height)) || 0,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLImageElement} image
     * @return {String}
     */
    imageToBase64 = (image) => {
        canvas.width = image.width;
        canvas.height = image.height;
        canvasContext.drawImage(image, 0,0);

        return canvas.toDataURL();
    };

/**
 * @namespace Exo
 */
export {
    audioContext,
    supportsCodec,
    decodeAudioBuffer,
    getMediaWidth,
    getMediaHeight,
    imageToBase64,
};
