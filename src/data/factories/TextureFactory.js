import ImageFactory from './ImageFactory';
import Texture from '../../display/Texture';

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
    async create(source, { mimeType, scaleMode, wrapMode, premultiplyAlpha, generateMipMap } = {}) {
        const image = await super.create(source, { mimeType });

        return new Texture(image, { scaleMode, wrapMode, premultiplyAlpha, generateMipMap });
    }
}
