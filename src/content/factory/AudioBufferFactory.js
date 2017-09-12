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
    create(response, options) {
        return super
            .create(response, options)
            .then((arrayBuffer) => decodeAudioBuffer(arrayBuffer));
    }
}
