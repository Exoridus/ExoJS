import AudioFactory from './AudioFactory';
import Music from '../../audio/Music';
import {webAudioSupported} from '../../utils';

/**
 * @class MusicFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class MusicFactory extends AudioFactory {

    /**
     * @override
     */
    get storageType() {
        return 'music';
    }

    /**
     * @override
     */
    create(response, options) {
        if (!webAudioSupported) {
            return Promise.reject();
        }

        return super
            .create(response, options)
            .then((audio) => new Music(audio));
    }
}
