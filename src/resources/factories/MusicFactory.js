import Music from '../../media/Music';
import BlobFactory from './BlobFactory';

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

            audio.addEventListener(loadEvent, () => resolve(new Music(audio, options)));
            audio.addEventListener('error', () => reject(Error('Error loading audio source.')));
            audio.addEventListener('abort', () => reject(Error('Audio loading was canceled.')));

            audio.src = this.createObjectURL(blob);
        });
    }
}
