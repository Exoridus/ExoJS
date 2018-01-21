import Music from '../../audio/Music';
import BlobFactory from './BlobFactory';
import support from '../../support';

/**
 * @inner
 * @type {Object<String, Boolean>|Boolean}
 */
const once = (support.eventOptions ? {
    capture: false,
    once: true,
} : false);

/**
 * @class MusicFactory
 * @extends BlobFactory
 */
export default class MusicFactory extends BlobFactory {

    /**
     * @override
     */
    get storageType() {
        return 'music';
    }

    /**
     * @override
     */
    async create(source, { options, mimeType, loadEvent = 'canplaythrough' } = {}) {
        const blob = await super.create(source, { mimeType });

        return new Promise((resolve, reject) => {
            const audio = document.createElement('audio');

            audio.addEventListener('error', () => reject(Error('Error loading audio source.')), once);
            audio.addEventListener('abort', () => reject(Error('Audio loading was canceled.')), once);
            audio.addEventListener(loadEvent, () => resolve(new Music(audio, options)), once);

            audio.preload = 'auto'
            audio.src = this.createObjectURL(blob);
        });
    }
}
