import ResourceFactory from '../ResourceFactory';

/**
 * @class TextFactory
 * @extends ResourceFactory
 */
export default class TextFactory extends ResourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'text';
    }

    /**
     * @override
     */
    async process(response) {
        return await response.text();
    }
}
