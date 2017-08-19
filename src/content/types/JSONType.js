import TextType from './TextType';

/**
 * @class JSONType
 * @memberof Exo
 * @extends {Exo.TextType}
 * @implements {Exo.ResourceType}
 */
export default class JSONType extends TextType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return super.loadSource(path);
    }

    /**
     * @override
     * @param {String} source
     * @returns {Promise}
     */
    create(source) {
        return super.create(source).then((text) => JSON.parse(text));
    }
}
