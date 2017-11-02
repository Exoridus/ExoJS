import MediaSourceFactory from './MediaSourceFactory';

/**
 * @class VideoSourceFactory
 * @extends MediaSourceFactory
 */
export default class VideoSourceFactory extends MediaSourceFactory {

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
        return super.create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent });
    }
}
