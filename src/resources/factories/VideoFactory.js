import Video from '../../rendering/Video';
import BlobFactory from './BlobFactory';
import support from '../../support';

/**
 * @private
 * @type {Object|Boolean}
 */
const once = (support.eventOptions ? {
    capture: false,
    once: true,
} : false);

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

            video.addEventListener('error', () => reject(Error('Video loading error.')), once);
            video.addEventListener('abort', () => reject(Error('Video loading error: cancelled.')), once);
            video.addEventListener('emptied', () => reject(Error('Video loading error: emptied.')), once);
            video.addEventListener('stalled', () => reject(Error('Video loading error: stalled.')), once);
            video.addEventListener(loadEvent, () => resolve(new Video(video, options)), once);

            video.preload = 'auto'
            video.src = this.createObjectURL(blob);
        });
    }
}
