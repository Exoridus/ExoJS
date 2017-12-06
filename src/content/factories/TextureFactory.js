import ImageFactory from './ImageFactory';
import Texture from '../../graphics/Texture';

/**
 * @class TextureFactory
 * @extends ImageFactory
 */
export default class TextureFactory extends ImageFactory {

    /**
     * @override
     */
    get storageType() {
        return 'image';
    }

    /**
     * @override
     */
    create(source, { mimeType, scaleMode, wrapMode, premultiplyAlpha, generateMipMap } = {}) {
        return super
            .create(source, { mimeType })
            .then((image) => new Texture(image, { scaleMode, wrapMode, premultiplyAlpha, generateMipMap }));
    }
}
