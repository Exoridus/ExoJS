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
    create(response, options) {
        if (!webAudioSupport) {
            return Promise.reject();
        }

        return super
            .create(response, options)
            .then((audio) => new Music(audio));
    }
}
