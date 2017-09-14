import AudioFactory from './AudioFactory';
import Music from '../../media/Music';
import support from '../../support';

/**
 * @class MusicFactory
 * @extends {ResourceFactory}
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
    create(source, options) {
        if (!support.webAudio) {
            return Promise.reject(Error('Web Audio is not supported!'));
        }

        return super
            .create(source, options)
            .then((audio) => new Music(audio));
    }
}
