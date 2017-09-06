import ResourceFactory from '../ResourceFactory';

/**
 * @class ArrayBufferFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class ArrayBufferFactory extends ResourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'arrayBuffer';
    }

    /**
     * @override
     */
    create(response, options) {
        return Promise.resolve(response.arrayBuffer());
    }
}
