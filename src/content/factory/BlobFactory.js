import ArrayBufferFactory from './ArrayBufferFactory';

/**
 * @class BlobFactory
 * @extends {ArrayBufferFactory}
 */
export default class BlobFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'blob';
    }

    /**
     * @override
     */
    create(source, { mimeType = 'text/plain' } = {}) {
        return super
            .create(source, null)
            .then((arrayBuffer) => new Blob([arrayBuffer], { type: mimeType }));
    }
}
