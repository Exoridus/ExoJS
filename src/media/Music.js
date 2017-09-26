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
        super(audio);

        if (!support.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

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
     * @override
     */
    get audioContext() {
        return this._audioContext;
    }

    /**
     * @override
     */
    get analyserTarget() {
        return this._gainNode;
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

            if (this._gainNode) {
                this._gainNode.gain.value = volume;
            }
        }
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
        this._gainNode.gain.value = this._volume;

        this._sourceNode = this._audioContext.createMediaElementSource(this.source);
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
