import { clamp } from '../utils/math';
import { AUDIO_CONTEXT } from '../const/core';
import Signal from '../core/Signal';

/**
 * @class Sound
 */
export default class Sound {

    /**
     * @constructor
     * @param {AudioBuffer} audioBuffer
     * @param {Object} [options]
     * @property {Number} [options.volume=settings.VOLUME_SOUND]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
     */
    constructor(audioBuffer, options) {

        /**
         * @private
         * @member {AudioBuffer}
         */
        this._audioBuffer = audioBuffer;

        /**
         * @private
         * @member {Number}
         */
        this._duration = audioBuffer.duration;

        /**
         * @private
         * @member {Number}
         */
        this._volume = 1;

        /**
         * @private
         * @member {Number}
         */
        this._speed = 1;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._muted = false;

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
         * @member {?AudioBufferSourceNode}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = AUDIO_CONTEXT.createGain();
        this._gainNode.gain.setTargetAtTime(this.volume, AUDIO_CONTEXT.currentTime, 10);
        this._gainNode.connect(AUDIO_CONTEXT.destination);

        /**
         * @private
         * @member {Signal}
         */
        this._onStart = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onStop = new Signal();

        if (options) {
            this.applyOptions(options);
        }
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get duration() {
        return this._duration;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get progress() {
        const elapsed = this.currentTime,
            duration = this.duration;

        return ((elapsed % duration) / duration);
    }

    /**
     * @public
     * @member {Number}
     */
    get volume() {
        return this._volume;
    }

    set volume(value) {
        const volume = clamp(value, 0, 2);

        if (this._volume !== volume) {
            this._volume = volume;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, AUDIO_CONTEXT.currentTime, 10);
            }
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get loop() {
        return this._loop;
    }

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
     * @public
     * @member {Number}
     */
    get speed() {
        return this._speed;
    }

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
     * @public
     * @member {Number}
     */
    get currentTime() {
        if (!this._startTime || !AUDIO_CONTEXT) {
            return 0;
        }

        return (this._currentTime + AUDIO_CONTEXT.currentTime - this._startTime);
    }

    set currentTime(currentTime) {
        this.pause();
        this._currentTime = Math.max(0, currentTime);
        this.play();
    }

    /**
     * @public
     * @member {Boolean}
     */
    get muted() {
        return this._muted;
    }

    set muted(value) {
        const muted = !!value;

        if (this._muted !== muted) {
            this._muted = muted;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, AUDIO_CONTEXT.currentTime, 10);
            }
        }
    }

    /**
     * @public
     * @member {Boolean}
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
     * @public
     * @member {Boolean}
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
     * @public
     * @readonly
     * @member {?AudioNode}
     */
    get analyserTarget() {
        return this._gainNode || null;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onStart() {
        return this._onStart;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onStop() {
        return this._onStop;
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.volume]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
     * @returns {Sound}
     */
    play(options) {
        if (options) {
            this.applyOptions(options);
        }

        if (this._paused) {
            this._sourceNode = AUDIO_CONTEXT.createBufferSource();
            this._sourceNode.buffer = this._audioBuffer;
            this._sourceNode.loop = this.loop;
            this._sourceNode.playbackRate.value = this.speed;
            this._sourceNode.connect(this._gainNode);
            this._sourceNode.start(0, this._currentTime);
            this._startTime = AUDIO_CONTEXT.currentTime;
            this._paused = false;
            this._onStart.dispatch();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sound}
     */
    pause() {
        if (!this._paused) {
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
            this._onStop.dispatch();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sound}
     */
    stop() {
        this.pause();
        this.currentTime = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.speed]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     * @param {Boolean} [options.muted]
     * @returns {Sound}
     */
    toggle(options) {
        return this.paused ? this.play(options) : this.pause();
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @param {Number} [options.volume]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.speed]
     * @param {Number} [options.time]
     * @param {Boolean} [options.muted]
     * @returns {Sound}
     */
    applyOptions({ volume, loop, speed, time, muted } = {}) {
        if (volume !== undefined) {
            this.volume = volume;
        }

        if (loop !== undefined) {
            this.loop = loop;
        }

        if (speed !== undefined) {
            this.speed = speed;
        }

        if (time !== undefined) {
            this.currentTime = time;
        }

        if (muted !== undefined) {
            this.muted = muted;
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.stop();

        if (this._sourceNode) {
            this._sourceNode.disconnect();
            this._sourceNode = null;
        }

        this._gainNode.disconnect();
        this._gainNode = null;

        this._onStart.destroy();
        this._onStart = null;

        this._onStop.destroy();
        this._onStop = null;

        this._audioBuffer = null;
        this._paused = null;
        this._startTime = null;
        this._currentTime = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
        this._muted = null;
    }
}
