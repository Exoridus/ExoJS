import ResourceType from '../ResourceType';

/**
 * @class ArrayBufferType
 * @extends {Exo.ResourceType}
 * @memberof Exo
 */
export default class ArrayBufferType extends ResourceType {

    /**
     * @override
     */
    get storageKey() {
        return 'arrayBuffer';
    }

    /**
     * @override
     */
    loadSource(path, request) {
        return super
            .loadSource(path, request)
            .then((response) => response.arrayBuffer());
    }
}
