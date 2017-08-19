import TextureType from './TextureType';
import Sprite from '../../display/sprite/Sprite';

/**
 * @class SpriteType
 * @memberof Exo
 * @extends {Exo.TextureType}
 * @implements {Exo.ResourceType}
 */
export default class SpriteType extends TextureType {

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
     * @param {ArrayBuffer} source
     * @param {String} [imageType='image/png']
     * @returns {Promise}
     */
    create(source, imageType = 'image/png') {
        return super.create(source, imageType).then((texture) => new Sprite(texture));
    }
}
