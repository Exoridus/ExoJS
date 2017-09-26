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
        super(audioBuffer);

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
    set loop(value) {
        const loop = !!value;

        if (this._loop !== loop) {
            this._loop = loop;

            if (this._sourceNode) {
                this._sourceNode.loop = loop;
            }
        }
    }

    /**
     * @override
     */
    set speed(value) {
        const speed = Math.max(0, value);

        if (this._speed !== speed) {
            this._speed = speed;

            if (this._sourceNode) {
                this._sourceNode.playbackRate.value = speed;
            }
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
    get paused() {
        if (!this._paused || this._loop) {
            return false;
        }

        return (this.currentTime >= this.duration);
    }

    /**
     * @override
     */
    get playing() {
        return !this._paused;
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
        this._gainNode.gain.value = this._volume;
    }

    /**
     * @override
     */
    play(options) {
        if (!this._paused) {
            return;
        }

        this.applyOptions(options);

        this._sourceNode = this._audioContext.createBufferSource();
        this._sourceNode.buffer = this._source;
        this._sourceNode.loop = this._loop;
        this._sourceNode.playbackRate.value = this._speed;

        this._sourceNode.connect(this._gainNode);
        this._sourceNode.start(0, this._currentTime);

        this._startTime = this._audioContext.currentTime;
        this._paused = false;

        this.trigger('start');
    }

    /**
     * @override
     */
    pause() {
        if (this._paused) {
            return;
        }

        const duration = this.duration,
            currentTime = this.currentTime;

        if (currentTime <= duration) {
            this._currentTime = currentTime;
        } else {
            this._currentTime = (currentTime - duration) * ((currentTime / duration) | 0);
        }

        this._sourceNode.stop(0);
        this._sourceNode.disconnect();
        this._sourceNode = null;
        this._paused = true;

        this.trigger('stop');
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
