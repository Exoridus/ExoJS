import ImageFactory from './ImageFactory';
import Texture from '../../display/Texture';
import settings from '../../settings';

/**
 * @class TextureFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
    create(response, { mimeType, scaleMode = settings.SCALE_MODE, wrapMode = settings.WRAP_MODE } = {}) {
        return super
            .create(response, { mimeType })
            .then((image) => new Texture(image, scaleMode, wrapMode));
    }
}
