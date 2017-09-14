import ArrayBufferFactory from './ArrayBufferFactory';
import { decodeAudioBuffer } from '../../utils';

/**
 * @class AudioBufferFactory
 * @extends {ResourceFactory}
 */
export default class AudioBufferFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'audioBuffer';
    }

    /**
     * @override
     */
    create(source, options) {
        return super
            .create(source, options)
            .then((arrayBuffer) => decodeAudioBuffer(arrayBuffer));
    }
}
