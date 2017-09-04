import BlobType from './BlobType';
import {getMimeType} from '../../utils';

/**
 * @class AudioType
 * @extends {Exo.BlobType}
 * @memberof Exo
 */
export default class AudioType extends BlobType {

    /**
     * @override
     */
    get storageKey() {
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

                audio.src = window.URL.createObjectURL(blob);
            }));
    }
}
