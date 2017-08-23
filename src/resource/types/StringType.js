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
    loadSource(path, request) {
        return super
            .loadSource(path, request)
            .then((response) => response.text());
    }
}
