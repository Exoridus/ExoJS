import { clamp } from '../utils/math';
import Sprite from './sprite/Sprite';
import Texture from './texture/Texture';
import settings from '../settings';
import { AUDIO_CONTEXT } from '../const/core';
import Signal from '../core/Signal';

/**
 * @class Video
 * @extends Sprite
 */
export default class Video extends Sprite {

    /**
     * @constructor
     * @param {HTMLMediaElement|HTMLVideoElement} videoElement
     * @param {Object} [options]
     * @param {Number} [options.volume=settings.VOLUME_VIDEO]
     * @param {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @param {Number} [options.speed=settings.MEDIA_SPEED]
     * @param {Number} [options.time=settings.MEDIA_TIME]
     * @param {Boolean} [options.muted=settings.MEDIA_MUTED]
     * @param {Number} [options.scaleMode]
     * @param {Number} [options.wrapMode]
     * @param {Boolean} [options.premultiplyAlpha]
     * @param {Boolean} [options.generateMipMap]
     */
    constructor(videoElement, {
        volume = settings.VOLUME_VIDEO,
        loop = settings.MEDIA_LOOP,
        speed = settings.MEDIA_SPEED,
        time = settings.MEDIA_TIME,
        muted = settings.MEDIA_MUTED,
        scaleMode,
        wrapMode,
        premultiplyAlpha,
        generateMipMap,
    } = {}) {
        super(new Texture(videoElement, { scaleMode, wrapMode, premultiplyAlpha, generateMipMap }));

        /**
         * @private
         * @member {HTMLMediaElement|HTMLVideoElement}
         */
        this._videoElement = videoElement;

        /**
         * @private
         * @member {Number}
         */
        this._duration = videoElement.duration;

        /**
         * @private
         * @member {Number}
         */
        this._volume = videoElement.volume;

        /**
         * @private
         * @member {Number}
         */
        this._speed = videoElement.playbackRate;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = videoElement.loop;

        /**
         * @private
         * @member {Boolean}
         */
        this._muted = videoElement.muted;

        /**
         * @private
         * @member {GainNode}
         */
        this._gainNode = AUDIO_CONTEXT.createGain();
        this._gainNode.gain.setTargetAtTime(this.volume, AUDIO_CONTEXT.currentTime, 10);
        this._gainNode.connect(AUDIO_CONTEXT.destination);

        /**
         * @private
         * @member {MediaElementAudioSourceNode}
         */
        this._sourceNode = AUDIO_CONTEXT.createMediaElementSource(videoElement);
        this._sourceNode.connect(this._gainNode);

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

        this.applyOptions({ volume, loop, speed, time, muted });
    }

    /**
     * @public
     * @readonly
     * @member {HTMLMediaElement|HTMLVideoElement}
     */
    get videoElement() {
        return this._videoElement;
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
     * @override
     */
    get loop() {
        return this._loop;
    }

    set loop(value) {
        const loop = !!value;

        if (this._loop !== loop) {
            this._videoElement.loop = this._loop = loop;
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
            this._videoElement.playbackRate = this._speed = speed;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get currentTime() {
        return this._videoElement.currentTime;
    }

    set currentTime(currentTime) {
        this._videoElement.currentTime = Math.max(0, currentTime);
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
        return this._videoElement.paused;
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
     * @returns {Video}
     */
    play(options) {
        if (this.paused) {
            this.applyOptions(options);
            this._videoElement.play();
            this._onStart.dispatch();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Video}
     */
    pause() {
        if (this.playing) {
            this._videoElement.pause();
            this._onStop.dispatch();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Video}
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
     * @returns {Video}
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
     * @returns {Video}
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
     * @override
     */
    render(renderManager) {
        this.texture.updateSource();
        super.render(renderManager);

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this.stop();

        this._sourceNode.disconnect();
        this._sourceNode = null;

        this._gainNode.disconnect();
        this._gainNode = null;

        this._onStart.destroy();
        this._onStart = null;

        this._onStop.destroy();
        this._onStop = null;

        this._videoElement = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
        this._muted = null;
    }
}
