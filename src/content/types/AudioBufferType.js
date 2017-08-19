import ArrayBufferType from './ArrayBufferType';
import { webAudioSupported } from '../../core/Utils';

const audioContext = webAudioSupported ? new AudioContext() : null;

/**
 * @class AudioBufferType
 * @memberof Exo
 * @extends {Exo.ArrayBufferType}
 * @implements {Exo.ResourceType}
 */
export default class AudioBufferType extends ArrayBufferType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return super.loadSource(path);
    }

    /**
     * @override
     * @param {ArrayBuffer} source
     * @returns {Promise}
     */
    create(source) {
        if (!webAudioSupported) {
            return Promise.reject();
        }

        return super.create(source).then((arrayBuffer) => new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        }));
    }
}
