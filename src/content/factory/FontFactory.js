import ArrayBufferFactory from './ArrayBufferFactory';
import { getFilename } from '../../utils';

/**
 * @class FontFactory
 * @extends {ResourceFactory}
 */
export default class FontFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'font';
    }

    /**
     * @override
     */
    create(source, { family, destriptors, addToDocument = true } = {}) {
        return super
            .create(source, null)
            .then((arrayBuffer) => new Promise((resolve, reject) => {
                const fontFace = new FontFace(family, arrayBuffer, destriptors),
                    promise = fontFace.load();

                if (addToDocument) {
                    promise.then(() => document.fonts.add(fontFace));
                }

                promise.then(
                    () => resolve(fontFace),
                    () => reject(fontFace),
                );
            }));
    }
}
