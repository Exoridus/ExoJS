import Music from '../../media/Music';
import VideoSourceFactory from './VideoSourceFactory';

/**
 * @class VideoFactory
 * @extends {VideoSourceFactory}
 */
export default class VideoFactory extends VideoSourceFactory {

    /**
     * @override
     */
    create(source, { createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent } = {}) {
        return super
            .create(source, { createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Music(audioSource));
    }
}
