const

    /**
     * @typedef {Object} FileType
     * @property {String} mimeType
     * @property {Number[]} pattern
     * @property {Number[]} mask
     */

    /**
     * @inner
     * @constant
     * @name FILE_TYPES
     * @type {FileType[]}
     */
    FILE_TYPES = [{
        mimeType: 'image/x-icon',
        pattern: [0x00, 0x00, 0x01, 0x00],
        mask: [0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/x-icon',
        pattern: [0x00, 0x00, 0x02, 0x00],
        mask: [0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/bmp',
        pattern: [0x42, 0x4D],
        mask: [0xFF, 0xFF],
    }, {
        mimeType: 'image/gif',
        pattern: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/gif',
        pattern: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/webp',
        pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/png',
        pattern: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/jpeg',
        pattern: [0xFF, 0xD8, 0xFF],
        mask: [0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/basic',
        pattern: [0x2E, 0x73, 0x6E, 0x64],
        mask: [0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/mpeg',
        pattern: [0x49, 0x44, 0x33],
        mask: [0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/wave',
        pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/midi',
        pattern: [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/aiff',
        pattern: [0x46, 0x4F, 0x52, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x41, 0x49, 0x46, 0x46],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'video/avi',
        pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'application/ogg',
        pattern: [0x4F, 0x67, 0x67, 0x53, 0x00],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }],

    /**
     * @inner
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Boolean}
     */
    matchesMP4Video = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer),
            view = new DataView(arrayBuffer),
            boxSize = view.getUint32(0, false);

        if (header.length < Math.max(12, boxSize) || boxSize % 4 !== 0) {
            return false;
        }

        return String.fromCharCode(...header.subarray(4, 11)) === 'ftypmp4';
    },

    /**
     * @inner
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Boolean}
     */
    matchesWebMVideo = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer),
            matching = [0x1A, 0x45, 0xDF, 0xA3].every((byte, i) => (byte === header[i])),
            sliced = header.subarray(4, 4 + 4096),
            index = sliced.findIndex((el, i, arr) => (arr[i] === 0x42 && arr[i + 1] === 0x82));

        if (!matching || index === -1) {
            return false;
        }

        return String.fromCharCode(...sliced.subarray(index + 3, index + 7)) === 'webm';
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {String}
     */
    determineMimeType = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer);

        if (!header.length) {
            throw new Error('Cannot determine mime type: No data.');
        }

        for (const type of FILE_TYPES) {
            if (header.length < type.pattern.length) {
                continue;
            }

            if (type.pattern.every((p, i) => (header[i] & type.mask[i]) === p)) {
                return type.mimeType;
            }
        }

        if (matchesMP4Video(arrayBuffer)) {
            return 'video/mp4';
        }

        if (matchesWebMVideo(arrayBuffer)) {
            return 'video/webm';
        }

        return 'text/plain';
    };

/**
 * @namespace Exo
 */
export {
    determineMimeType,
};
