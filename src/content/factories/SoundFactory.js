import MediaSourceFactory from './MediaSourceFactory';
import Sound from '../../media/Sound';
import support from '../../support';

/**
 * @class SoundFactory
 * @extends MediaSourceFactory
 */
export default class SoundFactory extends MediaSourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'sound';
    }

    /**
     * @override
     */
    create(source, { type = 'audio', createMediaElement = false, decodeAudioBuffer = true, mimeType, loadEvent } = {}) {
        return super
            .create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Sound(audioSource));
    }
}
