import Playable from './Playable';
import { clamp } from '../utils';

/**
 * @class Audio
 * @extends {Playable}
 */
export default class Audio extends Playable {

    /**
     * @constructor
     * @param {HTMLAudioElement} audio
     */
    constructor(audio) {
        super(audio);

        /**
         * @private
         * @member {Number}
         */
        this._volume = 1;

        /**
         * @private
         * @member {Number}
         */
        this._parentVolume = 1;
    }

    /**
     * @public
     * @member {Number}
     */
    get parentVolume() {
        return this._parentVolume;
    }

    set parentVolume(volume) {
        const newVolume = clamp(volume, 0, 1);

        if (this._parentVolume !== newVolume) {
            this._parentVolume = newVolume;
            this._source.volume = (this._volume * this._parentVolume);
        }
    }

    /**
     * @override
     */
    get volume() {
        return this._volume;
    }

    set volume(volume) {
        const newVolume = clamp(volume, 0, 2);

        if (this._volume !== newVolume) {
            this._volume = newVolume;
            this._source.volume = (this._volume * this._parentVolume);
        }
    }

    /**
     * @override
     */
    get analyserTarget() {
        throw new Error('Audio class cannot be analysed.');
    }

    /**
     * @override
     */
    connect(mediaManager) {
        this.parentVolume = mediaManager.masterVolume;
    }
}
