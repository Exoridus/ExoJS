import { AUDIO_ELEMENT, CANVAS_ELEMENT, CANVAS_CONTEXT, CODEC_NOT_SUPPORTED } from '../const/core';

const

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
        const { width, height } = image;

        CANVAS_ELEMENT.width = width;
        CANVAS_ELEMENT.height = height;

        CANVAS_CONTEXT.drawImage(image, 0, 0, width, height);

        return CANVAS_ELEMENT.toDataURL();
    },

    /**
     * @public
     * @param {...String} codecs
     * @returns {Boolean}
     */
    supportsCodec = (...codecs) => codecs.some((codec) => AUDIO_ELEMENT.canPlayType(codec).replace(CODEC_NOT_SUPPORTED, ''));

/**
 * @namespace Exo
 */
export {
    getMediaWidth,
    getMediaHeight,
    imageToBase64,
    supportsCodec,
};
