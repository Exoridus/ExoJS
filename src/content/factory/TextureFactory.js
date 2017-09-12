import ImageFactory from './ImageFactory';
import Texture from '../../display/Texture';
import settings from '../../settings';

/**
 * @class TextureFactory
 * @extends {ResourceFactory}
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
    create(response, { mimeType, scaleMode = settings.SCALE_MODE, wrapMode = settings.WRAP_MODE, premultiplyAlpha = settings.PREMULTIPLY_ALPHA } = {}) {
        return super
            .create(response, { mimeType })
            .then((image) => new Texture(image, {
                scaleMode,
                wrapMode,
                premultiplyAlpha,
            }));
    }
}
