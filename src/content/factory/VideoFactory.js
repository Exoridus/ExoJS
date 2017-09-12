import BlobFactory from './BlobFactory';
import { getMimeType } from '../../utils';

/**
 * @class VideoFactory
 * @extends {ResourceFactory}
 */
export default class VideoFactory extends BlobFactory {

    /**
     * @override
     */
    get storageType() {
        return 'video';
    }

    /**
     * @override
     */
    create(response, { mimeType = getMimeType(response, 'video'), loadEvent = 'canplaythrough' } = {}) {
        return super
            .create(response, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const video = document.createElement('video');

                video.addEventListener(loadEvent, () => resolve(video));
                video.addEventListener('error', () => reject(video));
                video.addEventListener('abort', () => reject(video));

                video.src = URL.createObjectURL(blob);
            }));
    }
}
