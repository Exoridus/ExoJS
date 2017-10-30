import MediaSourceFactory from './MediaSourceFactory';

/**
 * @class AudioSourceFactory
 * @extends {MediaSourceFactory}
 */
export default class AudioSourceFactory extends MediaSourceFactory {

    /**
     * @override
     */
    get storageType() {
        return 'audio';
    }

    /**
     * @override
     */
    create(source, { type = 'audio', createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent } = {}) {
        return super.create(source, { type, createMediaElement, decodeAudioBuffer, mimeType, loadEvent });
    }
}
