import Playable from './Playable';
import { clamp, webAudioSupported } from '../utils';

/**
 * @class Music
 * @extends {Playable}
 */
export default class Music extends Playable {

    /**
     * @constructor
     * @param {HTMLMediaElement} audio
     */
    constructor(audio) {
        super(audio);

        if (!webAudioSupported) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = null;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioContext}
     */
    get context() {
        return this._context;
    }

    /**
     * @override
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
     * @readonly
     * @member {?GainNode}
     */
    get analyserTarget() {
        return this._gainNode;
    }

    /**
     * @override
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
     * @override
     */
    destroy() {
        super.destroy();

        if (this._context) {
            this._context = null;

            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;
        }
    }
}
