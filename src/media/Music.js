import { clamp } from '../utils/math';
import { AUDIO_CONTEXT } from '../const/core';
import EventEmitter from '../core/EventEmitter';

/**
 * @class Music
 * @extends EventEmitter
 */
export default class Music extends EventEmitter {

    /**
     * @constructor
     * @param {HTMLMediaElement|HTMLAudioElement} audioElement
     * @param {Object} [options]
     * @property {Number} [options.volume=settings.VOLUME_MUSIC]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
     */
    constructor(audioElement, options) {
        super();

        /**
         * @private
         * @member {HTMLMediaElement|HTMLAudioElement}
         */
        this._audioElement = audioElement;

        /**
         * @private
         * @member {Number}
         */
        this._duration = audioElement.duration;

        /**
         * @private
         * @member {Number}
         */
        this._volume = audioElement.volume;

        /**
         * @private
         * @member {Number}
         */
        this._speed = audioElement.playbackRate;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = audioElement.loop;

        /**
         * @private
         * @member {Boolean}
         */
        this._muted = audioElement.muted;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = AUDIO_CONTEXT.createGain();
        this._gainNode.gain.setTargetAtTime(this._volume, AUDIO_CONTEXT.currentTime, 10);
        this._gainNode.connect(AUDIO_CONTEXT.destination);

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        this._sourceNode = AUDIO_CONTEXT.createMediaElementSource(audioElement);
        this._sourceNode.connect(this._gainNode);

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
                this._gainNode.gain.setTargetAtTime(volume, AUDIO_CONTEXT.currentTime, 10);
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
            this._audioElement.loop = this._loop = loop;
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
            this._audioElement.playbackRate = this._speed = speed;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get currentTime() {
        return this._audioElement.currentTime;
    }

    set currentTime(currentTime) {
        this._audioElement.currentTime = Math.max(0, currentTime);
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
            this._audioElement.muted = this._muted = muted;
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get paused() {
        return this._audioElement.paused;
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
        return !this.paused;
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
     * @chainable
     * @param {Object} [options]
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.volume]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
     * @returns {Music}
     */
    play(options) {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._audioElement.play();
            this.trigger('start');
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Music}
     */
    pause() {
        if (this.playing) {
            this._audioElement.pause();
            this.trigger('stop');
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Music}
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
     * @returns {Music}
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
     * @returns {Music}
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
        super.destroy();

        this.stop();

        this._sourceNode.disconnect();
        this._sourceNode = null;

        this._gainNode.disconnect();
        this._gainNode = null;

        this._audioElement = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
        this._muted = null;
    }
}
