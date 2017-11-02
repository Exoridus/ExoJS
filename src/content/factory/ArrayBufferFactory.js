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
    process(response) {
        return response.arrayBuffer();
    }

    /**
     * @override
     */
    create(source, options) { // eslint-disable-line
        return Promise.resolve(source);
    }
}
