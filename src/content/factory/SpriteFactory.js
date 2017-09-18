import TextureFactory from './TextureFactory';
import Sprite from '../../display/Sprite';

/**
 * @class SpriteFactory
 * @extends {TextureFactory}
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
    create(source, options) {
        return super
            .create(source, options)
            .then((texture) => new Sprite(texture));
    }
}
