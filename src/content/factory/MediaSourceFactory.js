import ArrayBufferFactory from './ArrayBufferFactory';
import MediaSource from '../../media/MediaSource';

/**
 * @class MediaSourceFactory
 * @extends {ArrayBufferFactory}
 */
export default class MediaSourceFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'media';
    }

    /**
     * @override
     */
    create(source, { type = null, createMediaElement = true, decodeAudioBuffer = false, mimeType, loadEvent } = {}) {
        return super
            .create(source, null)
            .then((arrayBuffer) => new MediaSource(type, arrayBuffer, { mimeType, loadEvent }))
            .then((mediaSource) => createMediaElement ? mediaSource.createMediaElement()
                .then((mediaElement) => mediaSource) : mediaSource)
            .then((mediaSource) => decodeAudioBuffer ? mediaSource.decodeAudioBuffer()
                .then((mediaSource) => mediaSource) : mediaSource);
    }
}
