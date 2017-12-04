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
    create(source, { type = 'video', createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent, volume, loop, speed, time, muted, scaleMode, wrapMode, premultiplyAlpha, generateMipMap } = {}) {
        return super
            .create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent })
            .then((audioSource) => new Video(audioSource, { volume, loop, speed, time, muted, scaleMode, wrapMode, premultiplyAlpha, generateMipMap }));
    }
}
