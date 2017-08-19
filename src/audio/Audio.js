import Playable from './Playable';
import { clamp } from '../core/Utils';

/**
 * @class Audio
 * @extends {Exo.Playable}
 * @memberof Exo
 */
export default class Audio extends Playable {

    /**
     * @constructor
     * @param {Audio} audio
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

    set parentVolume(value) {
        const volume = clamp(value, 0, 1);

        if (this._parentVolume !== volume) {
            this._parentVolume = volume;
            this._source.volume = this._volume * this._parentVolume;
        }
    }

    /**
     * @override
     */
    get volume() {
        return this._volume;
    }

    set volume(value) {
        const volume = clamp(value, 0, 2);

        if (this._volume !== volume) {
            this._volume = volume;
            this._source.volume = this._volume * this._parentVolume;
        }
    }

    /**
     * @override
     * @param {Exo.AudioManager} audioManager
     */
    connect(audioManager) {
        this.parentVolume = audioManager.masterVolume;
    }
}
