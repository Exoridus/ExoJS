import ArrayBufferFactory from './ArrayBufferFactory';

/**
 * @class FontFactory
 * @extends ArrayBufferFactory
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
                const fontFace = new FontFace(family, arrayBuffer, destriptors);

                fontFace
                    .load()
                    .then(() => {
                        if (addToDocument) {
                            document.fonts.add(fontFace);
                        }

                        resolve(fontFace);
                    })
                    .catch(() => reject(fontFace));
            }));
    }
}
