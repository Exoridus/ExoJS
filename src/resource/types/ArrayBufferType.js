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
    create(response, options) {
        return Promise.resolve(response.arrayBuffer());
    }
}
