import ArrayBufferFactory from './ArrayBufferFactory';
import {decodeAudioBuffer} from '../../utils';

/**
 * @class AudioBufferFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class AudioBufferFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    create(response, options) {
        return super
            .create(response, options)
            .then((arrayBuffer) => decodeAudioBuffer(arrayBuffer));
    }
}
