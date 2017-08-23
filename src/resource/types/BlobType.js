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
    loadSource(path, request) {
        return super.loadSource(path, request);
    }

    /**
     * @override
     */
    load(path, { mimeType = 'plain/text' } = {}) {
        return this
            .loadSource(path)
            .then((source) => this.create(source, { mimeType }));
    }

    /**
     * @override
     */
    create(source, { mimeType = 'plain/text' } = {}) {
        return super
            .create(source)
            .then((arrayBuffer) => new Blob([arrayBuffer], {
                type: mimeType,
            }));
    }
}
