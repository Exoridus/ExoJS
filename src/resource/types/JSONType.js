import ResourceType from '../ResourceType';

/**
 * @class JSONType
 * @extends {Exo.ResourceType}
 * @memberof Exo
 */
export default class JSONType extends ResourceType {

    /**
     * @override
     */
    get storageKey() {
        return 'json';
    }

    /**
     * @override
     */
    create(response, options) {
        return Promise.resolve(response.json());
    }
}
