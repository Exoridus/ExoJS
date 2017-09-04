import ArrayBufferType from './ArrayBufferType';
import {decodeAudioBuffer} from '../../utils';

/**
 * @class AudioBufferType
 * @extends {Exo.ArrayBufferType}
 * @memberof Exo
 */
export default class AudioBufferType extends ArrayBufferType {

    /**
     * @override
     */
    create(response, options) {
        return super
            .create(response, options)
            .then((arrayBuffer) => decodeAudioBuffer(arrayBuffer));
    }
}
