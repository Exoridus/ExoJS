import AudioType from './AudioType';
import Music from '../../audio/Music';
import {webAudioSupport} from '../../utils';

/**
 * @class MusicType
 * @extends {Exo.AudioType}
 * @memberof Exo
 */
export default class MusicType extends AudioType {

    /**
     * @override
     */
    get storageKey() {
        return 'music';
    }

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
        if (!webAudioSupport) {
            return Promise.reject();
        }

        return super
            .create(source, options)
            .then((audio) => new Music(audio));
    }
}
