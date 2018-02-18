import { AUDIO_ELEMENT, CANVAS_ELEMENT, CANVAS_CONTEXT, CODEC_NOT_SUPPORTED, TIMING } from '../const';

const

    /**
     * @public
     * @constant
     * @param {Event} event
     */
    stopEvent = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
    },

    /**
     * @public
     * @constant
     * @returns {Number}
     */
    getPreciseTime = () => TIMING.now(),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Array} array
     * @param {Number} startIndex
     * @param {Number} amount
     * @returns {Array}
     */
    removeArrayItems = (array, startIndex, amount) => {
        if (startIndex < array.length && amount > 0) {
            const length = array.length,
                removeCount = (startIndex + amount > length) ? (length - startIndex) : amount,
                newLen = (length - removeCount);

            for (let i = startIndex; i < newLen; i++) {
                array[i] = array[i + removeCount];
            }

            array.length = newLen;
        }

        return array;
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
        const { width, height } = image;

        CANVAS_ELEMENT.width = width;
        CANVAS_ELEMENT.height = height;

        CANVAS_CONTEXT.drawImage(image, 0, 0, width, height);

        return CANVAS_ELEMENT.toDataURL();
    },

    /**
     * @public
     * @constant
     * @param {...String} codecs
     * @returns {Boolean}
     */
    supportsCodec = (...codecs) => codecs.some((codec) => AUDIO_ELEMENT.canPlayType(codec).replace(CODEC_NOT_SUPPORTED, '')),

    /**
     * @public
     * @constant
     * @param {?HTMLElement|?String} selector
     * @param {HTMLElement|Document} [root=document]
     * @returns {?HTMLElement}
     */
    findElement = (selector, root = document) => {
        if (selector instanceof HTMLElement) {
            return selector;
        }

        if (typeof selector === 'string') {
            return root.querySelector(selector);
        }

        return null;
    };

/**
 * @namespace Exo
 */
export {
    stopEvent,
    getPreciseTime,
    removeArrayItems,
    getMediaWidth,
    getMediaHeight,
    imageToBase64,
    supportsCodec,
    findElement,
};
