import StringType from './StringType';

/**
 * @class JSONType
 * @extends {Exo.StringType}
 * @memberof Exo
 */
export default class JSONType extends StringType {

    /**
     * @override
     */
    get storageKey() {
        return 'json';
    }

    /**
     * @override
     */
    loadSource(path, request) {
        return super.loadSource(path, request);
    }

    /**
     * @override
     */
    create(source, options) {
        return super
            .create(source, options)
            .then((text) => JSON.parse(text));
    }
}
