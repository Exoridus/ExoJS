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
    create(response, options) {
        return Promise.resolve(response.text());
    }
}
