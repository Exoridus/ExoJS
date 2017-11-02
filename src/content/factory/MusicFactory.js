import AudioSourceFactory from './AudioSourceFactory';
import Music from '../../media/Music';

/**
 * @class MusicFactory
 * @extends AudioSourceFactory
 */
export default class MusicFactory extends AudioSourceFactory {

    /**
     * @override
     */
    create(source, { createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent } = {}) {
        return super
            .create(source, { createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Music(audioSource));
    }
}
