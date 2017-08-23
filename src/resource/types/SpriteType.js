import TextureType from './TextureType';
import Sprite from '../../display/sprite/Sprite';
import {SCALE_MODE, WRAP_MODE} from '../../const';

/**
 * @class SpriteType
 * @extends {Exo.TextureType}
 * @memberof Exo
 */
export default class SpriteType extends TextureType {

    /**
     * @override
     */
    loadSource(path, request) {
        return super.loadSource(path, request);
    }

    /**
     * @override
     */
    create(source, { mimeType = 'image/png', scaleMode = SCALE_MODE.NEAREST, wrapMode = WRAP_MODE.CLAMP_TO_EDGE } = {}) {
        return super
            .create(source, { mimeType, scaleMode, wrapMode })
            .then((texture) => new Sprite(texture));
    }
}
