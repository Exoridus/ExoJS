import AudioBufferType from './AudioBufferType';
import Sound from '../../audio/Sound';
import {webAudioSupport} from '../../utils';

/**
 * @class SoundType
 * @extends {Exo.AudioBufferType}
 * @memberof Exo
 */
export default class SoundType extends AudioBufferType {

    /**
     * @override
     */
    get storageKey() {
        return 'sound';
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
            .then((audioBuffer) => new Sound(audioBuffer));
    }
}
