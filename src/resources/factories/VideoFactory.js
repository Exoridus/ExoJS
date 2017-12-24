import Video from '../../media/Video';
import BlobFactory from './BlobFactory';

/**
 * @class VideoFactory
 * @extends BlobFactory
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
    async create(source, { options, mimeType, loadEvent = 'canplaythrough' } = {}) {
        const blob = await super.create(source, { mimeType });

        return new Promise((resolve, reject) => {
            const video = document.createElement('video');

            video.addEventListener(loadEvent, () => resolve(new Video(video, options)));
            video.addEventListener('error', () => reject(Error('Error loading audio source.')));
            video.addEventListener('abort', () => reject(Error('Audio loading was canceled.')));

            video.src = this.createObjectURL(blob);
        });
    }
}
