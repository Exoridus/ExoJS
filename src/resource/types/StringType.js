import ResourceType from '../ResourceType';

/**
 * @class StringType
 * @extends {Exo.ResourceType}
 * @memberof Exo
 */
export default class StringType extends ResourceType {

    /**
     * @override
     */
    get storageKey() {
        return 'string';
    }

    /**
     * @override
     */
    create(response, options) {
        return Promise.resolve(response.text());
    }
}
