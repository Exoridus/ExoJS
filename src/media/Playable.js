import { clamp } from '../utils';

/**
 * @abstract
 * @class Playable
 */
export default class Playable {

    /**
     * @constructor
     * @param {HTMLMediaElement|*} source
     */
    constructor(source) {

        /**
         * @private
         * @member {HTMLMediaElement|*}
         */
        this._source = source;
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
        return this._source.duration;
    }

    /**
     * @public
     * @member {Number}
     */
    get volume() {
        return this._source.volume;
    }

    set volume(volume) {
        this._source.volume = clamp(volume, 0, 2);
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
    get loop() {
        return this._source.loop;
    }

    set loop(loop) {
        this._source.loop = loop;
    }

    /**
     * @public
     * @member {Number}
     */
    get playbackRate() {
        return this._source.playbackRate;
    }

    set playbackRate(playbackRate) {
        this._source.playbackRate = Math.max(0, playbackRate);
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
     * @readonly
     * @member {?AudioNode}
     */
    get analyserTarget() {
        return null;
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
     * @abstract
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.playbackRate]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     */
    play(options) {
        if (this.paused) {
            this.applyOptions(options);
            this._source.play();
        }
    }

    /**
     * @public
     * @abstract
     */
    pause() {
        if (this.playing) {
            this._source.pause();
        }
    }

    /**
     * @public
     * @abstract
     */
    stop() {
        this.pause();
        this.currentTime = 0;
    }

    /**
     * @public
     * @abstract
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
     * @abstract
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.playbackRate]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     */
    applyOptions({ loop, playbackRate, volume, time } = {}) {
        if (loop !== undefined) {
            this.loop = loop;
        }

        if (playbackRate !== undefined) {
            this.playbackRate = playbackRate;
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
     * @abstract
     */
    destroy() {
        this.stop();

        this._source = null;
    }
}
