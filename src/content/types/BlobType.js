import ArrayBufferType from './ArrayBufferType';

/**
 * @class BlobType
 * @memberof Exo
 * @extends {Exo.ArrayBufferType}
 * @implements {Exo.ResourceType}
 */
export default class BlobType extends ArrayBufferType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return super.loadSource(path);
    }

    /**
     * @override
     * @param {String} path
     * @param {String} [type='plain/text']
     * @returns {Promise}
     */
    load(path, type = 'plain/text') {
        return this.loadSource(path).then((source) => this.create(source, type));
    }

    /**
     * @override
     * @param {ArrayBuffer} source
     * @param {String} [type='plain/text']
     * @returns {Promise}
     */
    create(source, type = 'plain/text') {
        return super.create(source).then((arrayBuffer) => new Blob([arrayBuffer], { type }));
    }
}
