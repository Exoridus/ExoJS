import { clamp } from '../utils';
import EventEmitter from '../core/EventEmitter';

/**
 * @abstract
 * @class Playable
 * @extends {EventEmitter}
 */
export default class Playable extends EventEmitter {

    /**
     * @constructor
     * @param {HTMLMediaElement|AudioBuffer} source
     */
    constructor(source) {
        super();

        /**
         * @private
         * @member {HTMLMediaElement|AudioBuffer}
         */
        this._source = source;

        /**
         * @private
         * @member {Number}
         */
        this._duration = source.duration || 0;

        /**
         * @private
         * @member {Number}
         */
        this._volume = source.volume || 1;

        /**
         * @private
         * @member {Number}
         */
        this._speed = source.playbackRate || 1;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = source.loop || false;
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
     * @readonly
     * @member {HTMLMediaElement|*}
     */
    get source() {
        return this._source;
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
            this._source.volume = this._volume = volume;
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
            this._source.loop = this._loop = loop;
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
            this._source.playbackRate = this._speed = speed;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get currentTime() {
        return this._source.currentTime;
    }

    set currentTime(currentTime) {
        this._source.currentTime = Math.max(0, currentTime);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get paused() {
        return this._source.paused;
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
     * @param {MediaManager} mediaManager
     */
    connect(mediaManager) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.speed]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     */
    play(options) {
        if (this.paused) {
            this.applyOptions(options);
            this._source.play();
            this.trigger('start');
        }
    }

    /**
     * @public
     */
    pause() {
        if (this.playing) {
            this._source.pause();
            this.trigger('stop');
        }
    }

    /**
     * @public
     */
    stop() {
        this.pause();
        this.currentTime = 0;
    }

    /**
     * @public
     */
    toggle() {
        if (this.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    /**
     * @public
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.speed]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
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
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this.stop();

        this._source = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
    }
}
