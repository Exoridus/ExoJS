import AudioBufferFactory from './AudioBufferFactory';
import Sound from '../../audio/Sound';
import {webAudioSupported} from '../../utils';

/**
 * @class SoundFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
export default class SoundFactory extends AudioBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'sound';
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
            .then((audioBuffer) => new Sound(audioBuffer));
    }
}
