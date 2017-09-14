import ResourceFactory from '../ResourceFactory';

/**
 * @class JSONFactory
 * @extends {ResourceFactory}
 */
export default class JSONFactory extends ResourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'json';
    }

    /**
     * @override
     */
    process(response) {
        return response.json();
    }

    /**
     * @override
     */
    create(source, options) {
        return Promise.resolve(source);
    }
}
