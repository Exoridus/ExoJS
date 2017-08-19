import ResourceType from './ResourceType';

/**
 * @class TextType
 * @memberof Exo
 * @implements {Exo.ResourceType}
 */
export default class TextType extends ResourceType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return fetch(path, {
            method: 'GET',
            mode: 'cors',
        }).then((response) => response.text());
    }
}
