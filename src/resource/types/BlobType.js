import ArrayBufferType from './ArrayBufferType';

/**
 * @class BlobType
 * @extends {Exo.ArrayBufferType}
 * @memberof Exo
 */
export default class BlobType extends ArrayBufferType {

    /**
     * @override
     */
    create(response, { mimeType = 'text/plain' } = {}) {
        return super
            .create(response, null)
            .then((arrayBuffer) => new Blob([arrayBuffer], { type: mimeType }));
    }
}
