import TextFactory from './TextFactory';

/**
 * @class SVGFactory
 * @extends TextFactory
 */
export default class SVGFactory extends TextFactory {

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
        return 'svg';
    }

    /**
     * @override
     */
    create(source, options) {
        return super
            .create(source, options)
            .then((text) => new Promise((resolve, reject) => {
                const blob = new Blob([text], { type: 'image/svg+xml' }),
                    objectURL = URL.createObjectURL(blob),
                    image = new Image();

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
