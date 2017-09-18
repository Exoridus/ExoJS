import Playable from './Playable';
import { clamp } from '../utils';
import support from '../support';

/**
 * @class Sound
 * @extends {Playable}
 */
export default class Sound extends Playable {

    /**
     * @constructor
     * @param {AudioBuffer} audioBuffer
     */
    constructor(audioBuffer) {
        if (!support.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        super(audioBuffer);

        /**
         * @private
         * @member {?AudioContext}
         */
        this._audioContext = null;

        /**
         * @private
         * @member {?AudioBufferSourceNode}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._paused = true;

        /**
         * @private
         * @member {Number}
         */
        this._startTime = 0;

        /**
         * @private
         * @member {Number}
         */
        this._currentTime = 0;

        /**
         * @private
         * @member {Number}
         */
        this._volume = 1;

        /**
         * @private
         * @member {Number}
         */
        this._playbackRate = 1;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = false;
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
        return this._volume;
    }

    set volume(volume) {
        this._volume = clamp(volume, 0, 2);

        if (this._gainNode) {
            this._gainNode.gain.value = this._volume;
        }
    }

    /**
     * @override
     */
    get currentTime() {
        if (!this._startTime || !this._audioContext) {
            return 0;
        }

        return (this._currentTime + this._audioContext.currentTime - this._startTime);
    }

    set currentTime(currentTime) {
        this.pause();
        this._currentTime = Math.max(0, currentTime);
        this.play();
    }

    /**
     * @override
     */
    get loop() {
        return this._loop;
    }

    set loop(loop) {
        this._loop = loop;

        if (this._sourceNode) {
            this._sourceNode.loop = this._loop;
        }
    }

    /**
     * @override
     */
    get playbackRate() {
        return this._playbackRate;
    }

    set playbackRate(playbackRate) {
        this._playbackRate = Math.max(0, playbackRate);

        if (this._sourceNode) {
            this._sourceNode.playbackRate.value = this._playbackRate;
        }
    }

    /**
     * @override
     */
    get paused() {
        if (!this._paused || this._loop) {
            return false;
        }

        return (this.currentTime >= this.duration);
    }

    set paused(paused) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * @override
     */
    get playing() {
        return !this._paused;
    }

    set playing(playing) {
        if (playing) {
            this.play();
        } else {
            this.pause();
        }
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
    connect(mediaManager) {
        if (this._audioContext) {
            return;
        }

        this._audioContext = mediaManager.audioContext;

        this._gainNode = this._audioContext.createGain();
        this._gainNode.connect(mediaManager.soundGain);
    }

    /**
     * @override
     */
    play(options) {
        if (!this._paused) {
            return;
        }

        this._paused = false;

        if (this._sourceNode) {
            this._sourceNode.stop(0);
            this._sourceNode.disconnect();
        }

        this.applyOptions(options);

        this._sourceNode = this._audioContext.createBufferSource();
        this._sourceNode.buffer = this._source;
        this._sourceNode.loop = this._loop;
        this._sourceNode.playbackRate.value = this._playbackRate;

        this._sourceNode.connect(this._gainNode);
        this._sourceNode.start(0, this._currentTime);

        this._startTime = this._audioContext.currentTime;
    }

    /**
     * @override
     */
    pause() {
        if (this._paused) {
            return;
        }

        this._paused = true;

        const duration = this.duration,
            currentTime = this.currentTime;

        if (currentTime <= duration) {
            this._currentTime = currentTime;
        } else {
            this._currentTime = (currentTime - duration) * ((currentTime / duration) | 0);
        }

        this._sourceNode.stop(0);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        if (this._audioContext) {
            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;

            this._audioContext = null;
        }
    }
}
