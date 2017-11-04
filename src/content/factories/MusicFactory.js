import MediaSourceFactory from './MediaSourceFactory';
import Music from '../../media/Music';

/**
 * @class MusicFactory
 * @extends MediaSourceFactory
 */
export default class MusicFactory extends MediaSourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'sound';
    }

    /**
     * @override
     */
    create(source, { type = 'audio', createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent } = {}) {
        return super
            .create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Music(audioSource));
    }
}
