import Playable from './Playable';
import { clamp } from '../utils';
import support from '../support';

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
        if (!support.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        super(audio);

        /**
         * @private
         * @member {?AudioContext}
         */
        this._audioContext = null;

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
    get audioContext() {
        return this._audioContext;
    }

    /**
     * @override
     */
    get volume() {
        return this._audioContext ? this._gainNode.gain.value : 1;
    }

    set volume(volume) {
        if (this._audioContext) {
            this._gainNode.gain.value = clamp(volume, 0, 1);
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
    connect(mediaManager) {
        if (this._audioContext) {
            return;
        }

        this._audioContext = mediaManager.audioContext;

        this._gainNode = this._audioContext.createGain();
        this._gainNode.connect(mediaManager.musicGain);

        this._sourceNode = this._audioContext.createMediaElementSource(this._source);
        this._sourceNode.connect(this._gainNode);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        if (this._audioContext) {
            this._audioContext = null;

            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;
        }
    }
}
