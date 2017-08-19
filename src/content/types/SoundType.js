import AudioBufferType from './AudioBufferType';
import Sound from '../../audio/Sound';
import { webAudioSupported } from '../../core/Utils';

/**
 * @class SoundType
 * @memberof Exo
 * @implements {Exo.ResourceType}
 */
export default class SoundType extends AudioBufferType {

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

        return super.create(source).then((audioBuffer) => new Sound(audioBuffer));
    }
}
