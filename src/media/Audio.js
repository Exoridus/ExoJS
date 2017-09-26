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
        this._parentVolume = 1;
    }

    /**
     * @override
     */
    get audioContext() {
        return null;
    }

    /**
     * @override
     */
    get analyserTarget() {
        return null;
    }

    /**
     * @override
     */
    set volume(value) {
        const volume = clamp(value, 0, 2);

        if (this.volume !== volume) {
            this._volume = volume;
            this._source.volume = (volume * this._parentVolume);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get parentVolume() {
        return this._parentVolume;
    }

    set parentVolume(value) {
        const parentVolume = clamp(value, 0, 1);

        if (this.parentVolume !== parentVolume) {
            this._parentVolume = parentVolume;
            this._source.volume = (this._volume * parentVolume);
        }
    }

    /**
     * @override
     */
    connect(mediaManager) {
        this.parentVolume = mediaManager.masterVolume;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._parentVolume = null;
    }
}
