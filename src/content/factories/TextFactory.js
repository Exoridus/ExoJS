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
    process(response) {
        return response.text();
    }

    /**
     * @override
     */
    create(source, options) { // eslint-disable-line
        return Promise.resolve(source);
    }
}
