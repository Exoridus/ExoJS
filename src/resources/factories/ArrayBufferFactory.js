import ResourceFactory from '../ResourceFactory';

/**
 * @class ArrayBufferFactory
 * @extends ResourceFactory
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
    async process(response) {
        return await response.arrayBuffer();
    }
}
