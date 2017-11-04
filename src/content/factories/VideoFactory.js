import Video from '../../media/Video';
import MediaSourceFactory from './MediaSourceFactory';

/**
 * @class VideoFactory
 * @extends MediaSourceFactory
 */
export default class VideoFactory extends MediaSourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'video';
    }

    /**
     * @override
     */
    create(source, { type = 'video', createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent } = {}) {
        return super
            .create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Video(audioSource));
    }
}
