import BlobFactory from './BlobFactory';
import {getMimeType} from '../../utils';

/**
 * @class AudioFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class AudioFactory extends BlobFactory {

    /**
     * @override
     */
    get storageType() {
        return 'audio';
    }

    /**
     * @override
     */
    create(response, { mimeType = getMimeType(response, 'audio'), loadEvent = 'canplaythrough' } = {}) {
        return super
            .create(response, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const audio = new Audio();

                audio.addEventListener(loadEvent, () => resolve(audio));
                audio.addEventListener('error', () => reject(audio));
                audio.addEventListener('abort', () => reject(audio));

                audio.src = URL.createObjectURL(blob);
            }));
    }
}
