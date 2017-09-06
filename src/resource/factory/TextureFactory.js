import ImageFactory from './ImageFactory';
import {SCALE_MODE, WRAP_MODE} from '../../const';
import Texture from '../../display/Texture';

/**
 * @class TextureFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class TextureFactory extends ImageFactory {

    /**
     * @override
     */
    create(response, { mimeType, scaleMode = SCALE_MODE.NEAREST, wrapMode = WRAP_MODE.CLAMP_TO_EDGE } = {}) {
        return super
            .create(response, { mimeType })
            .then((image) => new Texture(image, scaleMode, wrapMode));
    }
}
