import ArrayBufferFactory from './ArrayBufferFactory';

/**
 * @class BlobFactory
 * @extends {ResourceFactory}
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
    create(response, { mimeType = 'text/plain' } = {}) {
        return super
            .create(response, null)
            .then((arrayBuffer) => new Blob([arrayBuffer], { type: mimeType }));
    }
}
