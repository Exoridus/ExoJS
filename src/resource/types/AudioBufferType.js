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
    loadSource(path, request) {
        return super.loadSource(path, request);
    }

    /**
     * @override
     */
    create(source, options) {
        return super
            .create(source, options)
            .then((source) => decodeAudioBuffer(source));
    }
}
