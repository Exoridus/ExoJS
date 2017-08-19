import Playable from './Playable';
import { clamp, webAudioSupported } from '../core/Utils';

/**
 * @class Music
 * @extends {Exo.Playable}
 * @memberof Exo
 */
export default class Music extends Playable {

    /**
     * @constructor
     * @param {HTMLMediaElement} audio
     */
    constructor(audio) {
        super(audio);

        if (!webAudioSupported) {
            throw new Error('Web Audio API is not supported, use the fallback Exo.Audio instead.');
        }

        /**
         * @private
         * @member {AudioContext|null}
         */
        this._context = null;

        /**
         * @private
         * @member {MediaElementAudioSourceNode|null}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {GainNode|null}
         */
        this._gainNode = null;
    }

    /**
     * @public
     * @readonly
     * @member {AudioContext|null}
     */
    get context() {
        return this._context;
    }

    /**
     * @public
     * @override
     * @member {Number}
     */
    get volume() {
        return this._context ? this._gainNode.gain.value : 1;
    }

    set volume(value) {
        if (this._context) {
            this._gainNode.gain.value = clamp(value, 0, 1);
        }
    }

    /**
     * @public
     * @override
     * @readonly
     * @member {GainNode|null}
     */
    get analyserTarget() {
        return this._gainNode;
    }

    /**
     * @public
     * @override
     * @param {Exo.AudioManager} audioManager
     */
    connect(audioManager) {
        if (this._context) {
            return;
        }

        this._context = audioManager.context;

        this._gainNode = this._context.createGain();
        this._gainNode.connect(audioManager.musicNode);

        this._sourceNode = this._context.createMediaElementSource(this._source);
        this._sourceNode.connect(this._gainNode);
    }

    /**
     * @public
     * @override
     */
    destroy() {
        super.destroy();

        if (this._context) {
            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;

            this._context = null;
        }
    }
}
