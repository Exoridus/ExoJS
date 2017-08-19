import AudioType from './AudioType';
import Music from '../../audio/Music';
import { webAudioSupported } from '../../core/Utils';

/**
 * @class MusicType
 * @memberof Exo
 * @extends {Exo.AudioType}
 * @implements {Exo.ResourceType}
 */
export default class MusicType extends AudioType {

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

        return super.create(source).then((audio) => new Music(audio));
    }
}
