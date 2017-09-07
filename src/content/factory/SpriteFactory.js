import TextureFactory from './TextureFactory';
import Sprite from '../../display/sprite/Sprite';

/**
 * @class SpriteFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class SpriteFactory extends TextureFactory {

    /**
     * @override
     */
    get storageType() {
        return 'image';
    }

    /**
     * @override
     */
    create(response, options) {
        return super
            .create(response, options)
            .then((texture) => new Sprite(texture));
    }
}
