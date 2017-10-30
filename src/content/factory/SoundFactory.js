import AudioSourceFactory from './AudioSourceFactory';
import Sound from '../../media/Sound';

/**
 * @class SoundFactory
 * @extends {AudioSourceFactory}
 */
export default class SoundFactory extends AudioSourceFactory {

    /**
     * @override
     */
    create(source, { createMediaElement = false, decodeAudioBuffer = true, mimeType, loadEvent } = {}) {
        return super
            .create(source, { createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Sound(audioSource));
    }
}
