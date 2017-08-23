import Playable from './Playable';
import {clamp, webAudioSupport} from '../utils';

/**
 * @class Sound
 * @extends {Exo.Playable}
 * @memberof Exo
 */
export default class Sound extends Playable {

    /**
     * @constructor
     * @param {AudioBuffer} audioBuffer
     */
    constructor(audioBuffer) {
        super(audioBuffer);

        if (!webAudioSupport) {
            throw new Error('Web Audio API is not supported, use the fallback Exo.Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
        this._context = null;

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
    get context() {
        return this._context;
    }

    /**
     * @override
     */
    get volume() {
        return this._volume;
    }

    set volume(value) {
        this._volume = clamp(value, 0, 2);

        if (this._gainNode) {
            this._gainNode.gain.value = this._volume;
        }
    }

    /**
     * @override
     */
    get currentTime() {
        if (!this._startTime || !this._context) {
            return 0;
        }

        return (this._currentTime + this._context.currentTime - this._startTime);
    }

    set currentTime(value) {
        this.pause();
        this._currentTime = Math.max(0, value);
        this.play();
    }

    /**
     * @override
     */
    get loop() {
        return this._loop;
    }

    set loop(value) {
        this._loop = !!value;

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

    set playbackRate(value) {
        this._playbackRate = Math.max(0, value);

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

    set paused(value) {
        if (value) {
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

    set playing(value) {
        if (value) {
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
    connect(audioManager) {
        if (this._context) {
            return;
        }

        this._context = audioManager.context;

        this._gainNode = this._context.createGain();
        this._gainNode.connect(audioManager.soundNode);
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

        this._sourceNode = this._context.createBufferSource();
        this._sourceNode.buffer = this._source;
        this._sourceNode.loop = this._loop;
        this._sourceNode.playbackRate.value = this._playbackRate;

        this._sourceNode.connect(this._gainNode);
        this._sourceNode.start(0, this._currentTime);

        this._startTime = this._context.currentTime;
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

        this._currentTime = (currentTime <= duration) ? currentTime : (currentTime - duration) * ((currentTime / duration) | 0);
        this._sourceNode.stop(0);
    }

    /**
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
