import MediaSourceFactory from './MediaSourceFactory';
import Sound from '../../media/Sound';

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
    create(source, { type = 'audio', createMediaElement = false, decodeAudioBuffer = true, mimeType, loadEvent, volume, loop, speed, time, muted } = {}) {
        return super
            .create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Sound(audioSource, { volume, loop, speed, time, muted }));
    }
}
