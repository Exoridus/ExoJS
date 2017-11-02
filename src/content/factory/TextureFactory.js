import ImageFactory from './ImageFactory';
import Texture from '../../graphics/Texture';
import settings from '../../settings';

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
    create(source, {
        mimeType,
        scaleMode = settings.SCALE_MODE,
        wrapMode = settings.WRAP_MODE,
        premultiplyAlpha = settings.PREMULTIPLY_ALPHA,
    } = {}) {
        return super
            .create(source, { mimeType })
            .then((image) => new Texture(image, { scaleMode, wrapMode, premultiplyAlpha }));
    }
}
