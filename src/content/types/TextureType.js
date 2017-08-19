import ImageType from './ImageType';
import Texture from '../../display/Texture';

/**
 * @class TextureType
 * @memberof Exo
 * @extends {Exo.ImageType}
 * @implements {Exo.ResourceType}
 */
export default class TextureType extends ImageType {

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
        return super.create(source, imageType).then((image) => new Texture(image));
    }
}
