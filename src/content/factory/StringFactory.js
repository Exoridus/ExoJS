import ResourceFactory from '../ResourceFactory';

/**
 * @class StringFactory
 * @extends {ResourceFactory}
 */
export default class StringFactory extends ResourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'string';
    }

    /**
     * @override
     */
    process(response) {
        return response.text();
    }

    /**
     * @override
     */
    create(source, options) {
        return Promise.resolve(source);
    }
}
