import TextureFactory from './TextureFactory';
import Sprite from '../../display/Sprite';

/**
 * @class SpriteFactory
 * @extends {ResourceFactory}
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
