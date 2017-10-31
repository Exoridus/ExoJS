import { clamp } from '../utils';
import support from '../support';
import Media from './Media';

/**
 * @class Music
 * @extends {Media}
 */
export default class Music extends Media {

    /**
     * @constructs Music
     * @param {MediaSource} mediaSource
     */
    constructor(mediaSource) {
        super(mediaSource);

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
    get audioContext() {
        return this._audioContext || null;
    }

    /**
     * @override
     */
    get analyserTarget() {
        return this._gainNode || null;
    }

    /**
     * @override
     */
    connect(mediaManager) {
        if (support.webAudio && !this._audioContext) {
            this._audioContext = mediaManager.audioContext;

            this._gainNode = this._audioContext.createGain();
            this._gainNode.gain.value = this.volume;
            this._gainNode.connect(mediaManager.musicGain);

            this._sourceNode = this._audioContext.createMediaElementSource(this.mediaElement);
            this._sourceNode.connect(this._gainNode);
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        if (this._audioContext) {
            this._audioContext = null;

            this._gainNode.disconnect();
            this._gainNode = null;

            this._sourceNode.disconnect();
            this._sourceNode = null;
        }

        return this;
    }
}
