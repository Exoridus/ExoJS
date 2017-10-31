import { clamp } from '../utils';
import EventEmitter from '../core/EventEmitter';

/**
 * @typedef {Object} MediaOptions
 * @property {Boolean} loop
 * @property {Number} speed
 * @property {Number} volume
 * @property {Number} time
 */

/**
 * @abstract
 * @class Media
 * @extends {EventEmitter}
 */
export default class Media extends EventEmitter {

    /**
     * @constructs Media
     * @param {MediaSource} mediaSource
     */
    constructor(mediaSource) {
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
        this._duration = this._mediaElement.duration || 0;

        /**
         * @private
         * @member {Number}
         */
        this._volume = this._mediaElement.volume || 1;

        /**
         * @private
         * @member {Number}
         */
        this._speed = this._mediaElement.playbackRate || 1;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = this._mediaElement.loop || false;
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
     * @abstract
     * @readonly
     * @member {?AudioContext}
     */
    get audioContext() {
        return null;
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {?AudioNode}
     */
    get analyserTarget() {
        return null;
    }

    /**
     * @public
     * @chainable
     * @param {MediaOptions} [options]
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
     * @returns {Media}
     */
    toggle() {
        if (this.paused) {
            this.play();
        } else {
            this.pause();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {MediaOptions} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.speed]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     * @returns {Media}
     */
    applyOptions({ loop, speed, volume, time } = {}) {
        if (loop !== undefined) {
            this.loop = loop;
        }

        if (speed !== undefined) {
            this.speed = speed;
        }

        if (volume !== undefined) {
            this.volume = volume;
        }

        if (time !== undefined) {
            this.currentTime = time;
        }

        return this;
    }

    /**
     * @public
     * @abstract
     * @chainable
     * @param {MediaManager} mediaManager
     * @returns {Media}
     */
    connect(mediaManager) { // eslint-disable-line
        return this;
    }

    /**
     * @public
     * @abstract
     * @chainable
     * @returns {Media}
     */
    disconnect() {
        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this.stop();
        this.disconnect();

        this._mediaSource = null;
        this._mediaElement = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
    }
}
