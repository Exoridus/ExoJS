import ResourceType from './ResourceType';

/**
 * @class ArrayBufferType
 * @memberof Exo
 * @implements {Exo.ResourceType}
 */
export default class ArrayBufferType extends ResourceType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return fetch(path, {
            method: 'GET',
            mode: 'cors',
        }).then((response) => response.arrayBuffer());
    }
}
