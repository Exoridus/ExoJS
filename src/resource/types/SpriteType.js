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
    create(response, options) {
        return super
            .create(response, options)
            .then((texture) => new Sprite(texture));
    }
}
