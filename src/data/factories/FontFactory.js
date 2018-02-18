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
    async create(source, { family, destriptors, addToDocument = true } = {}) {
        const arrayBuffer = await super.create(source, null),
            fontFace = await new FontFace(family, arrayBuffer, destriptors).load();

        if (addToDocument) {
            document.fonts.add(fontFace);
        }

        return fontFace;
    }
}
