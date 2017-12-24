import ArrayBufferFactory from './ArrayBufferFactory';
import Sound from '../../media/Sound';
import { AUDIO_CONTEXT } from '../../const/core';

/**
 * @class SoundFactory
 * @extends ArrayBufferFactory
 */
export default class SoundFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'sound';
    }

    /**
     * @override
     */
    async create(source, { options } = {}) {
        const arrayBuffer = await super.create(source, null),
            audioBuffer = await AUDIO_CONTEXT.decodeAudioData(arrayBuffer);

        return new Sound(audioBuffer, options);
    }
}
