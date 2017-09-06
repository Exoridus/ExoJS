import ArrayBufferFactory from './ArrayBufferFactory';
import {getFilename} from '../../utils';

/**
 * @class FontFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
    create(response, { addToDocument = true, family = getFilename(response.url), destriptors } = {}) {
        return super
            .create(response, null)
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
