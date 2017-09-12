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
    create(response, options) {
        return Promise.resolve(response.json());
    }
}
