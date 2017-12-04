import { clamp } from '../utils';
import EventEmitter from '../core/EventEmitter';

/**
 * @class Media
 * @extends EventEmitter
 */
export default class Media extends EventEmitter {

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     * @param {Object} [options]
     * @property {Number} [options.volume]
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
     */
    constructor(mediaSource, options) {
        super();

        /**
         * @private
         * @member {MediaSource}
         */
        this._mediaSource = mediaSource;

        /**
         * @private
         * @member {?HTMLMediaElement}
         */
        this._mediaElement = mediaSource.mediaElement;

        /**
         * @private
         * @member {Number}
         */
        this._duration = 0;

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

        if (options !== undefined) {
            this.applyOptions(options);
        }
    }

    /**
     * @public
     * @readonly
     * @member {MediaSource}
     */
    get mediaSource() {
        return this._mediaSource;
    }

    /**
     * @public
     * @readonly
     * @member {?HTMLMediaElement}
     */
    get mediaElement() {
        return this._mediaElement;
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

        if (this.volume !== volume) {
            this._mediaElement.volume = this._volume = volume;
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

        if (this.loop !== loop) {
            this._mediaElement.loop = this._loop = loop;
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

        if (this.speed !== speed) {
            this._mediaElement.playbackRate = this._speed = speed;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get currentTime() {
        return this._mediaElement.currentTime;
    }

    set currentTime(currentTime) {
        this._mediaElement.currentTime = Math.max(0, currentTime);
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

        if (this.muted !== muted) {
            this._mediaElement.muted = this._muted = muted;
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get paused() {
        return this._mediaElement.paused;
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
        return null;
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
     * @returns {Media}
     */
    play(options) {
        if (this.paused) {
            this.applyOptions(options);
            this._mediaElement.play();
            this.trigger('start');
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Media}
     */
    pause() {
        if (this.playing) {
            this._mediaElement.pause();
            this.trigger('stop');
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Media}
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
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.volume]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
     * @returns {Media}
     */
    toggle(options) {
        return this.paused ? this.play(options) : this.pause();
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @property {Number} [options.volume]
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
     * @returns {Media}
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

        this._mediaSource = null;
        this._mediaElement = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
        this._muted = null;
    }
}
