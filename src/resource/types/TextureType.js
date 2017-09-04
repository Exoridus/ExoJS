import ImageType from './ImageType';
import {SCALE_MODE, WRAP_MODE} from '../../const';
import Texture from '../../display/Texture';

/**
 * @class TextureType
 * @extends {Exo.ImageType}
 * @memberof Exo
 */
export default class TextureType extends ImageType {

    /**
     * @override
     */
    create(response, { mimeType, scaleMode = SCALE_MODE.NEAREST, wrapMode = WRAP_MODE.CLAMP_TO_EDGE } = {}) {
        return super
            .create(response, { mimeType })
            .then((image) => new Texture(image, scaleMode, wrapMode));
    }
}
