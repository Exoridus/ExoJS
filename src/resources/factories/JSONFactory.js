import ResourceFactory from '../ResourceFactory';

/**
 * @class JSONFactory
 * @extends ResourceFactory
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
    async process(response) {
        return await response.json();
    }
}
