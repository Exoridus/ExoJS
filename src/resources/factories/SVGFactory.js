import TextFactory from './TextFactory';

/**
 * @class SVGFactory
 * @extends TextFactory
 */
export default class SVGFactory extends TextFactory {

    /**
     * @override
     */
    get storageType() {
        return 'svg';
    }

    /**
     * @override
     */
    async create(source, options) {
        const text = await super.create(source, null),
            blob = new Blob([text], { type: 'image/svg+xml' });

        return new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener('load', () => resolve(image));
            image.addEventListener('error', () => reject(Error('Error loading image source.')));
            image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

            image.src = this.createObjectURL(blob);
        });
    }
}
