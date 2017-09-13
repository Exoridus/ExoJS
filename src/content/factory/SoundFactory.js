import AudioBufferFactory from './AudioBufferFactory';
import Sound from '../../media/Sound';
import support from '../../support';

/**
 * @class SoundFactory
 * @extends {ResourceFactory}
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
        if (!support.webAudio) {
            return Promise.reject(Error('Web Audio is not supported!'));
        }

        return super
            .create(response, options)
            .then((audioBuffer) => new Sound(audioBuffer));
    }
}
