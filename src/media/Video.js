import { audioContext, clamp } from '../utils';
import Sprite from '../graphics/sprite/Sprite';
import Texture from '../graphics/texture/Texture';
import support from '../support';
import settings from '../settings';

/**
 * @class Video
 * @extends {Media|Sprite}
 */
export default class Video extends Sprite {

    /**
     * @constructor
     * @param {MediaSource} mediaSource
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
    constructor(mediaSource, {
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
        super(new Texture(mediaSource.mediaElement, { scaleMode, wrapMode, premultiplyAlpha, generateMipMap }));

        const mediaElement = mediaSource.mediaElement;

        /**
         * @private
         * @member {MediaSource}
         */
        this._mediaSource = mediaSource;

        /**
         * @private
         * @member {?HTMLMediaElement}
         */
        this._mediaElement = mediaElement;

        /**
         * @private
         * @member {Number}
         */
        this._duration = mediaElement ? mediaElement.duration : 0;

        /**
         * @private
         * @member {Number}
         */
        this._volume = mediaElement ? mediaElement.volume : 1;

        /**
         * @private
         * @member {Number}
         */
        this._speed = mediaElement ? mediaElement.playbackRate : 1;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = mediaElement ? mediaElement.loop : false;

        /**
         * @private
         * @member {Boolean}
         */
        this._muted = mediaElement ? mediaElement.muted : false;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = audioContext.createGain();
        this._gainNode.gain.value = this.volume;
        this._gainNode.connect(audioContext.destination);

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        this._sourceNode = audioContext.createMediaElementSource(this._mediaElement);
        this._sourceNode.connect(this._gainNode);

        this.applyOptions({ volume, loop, speed, time, muted });
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

        if (this._volume !== volume) {
            this._volume = volume;

            if (this._gainNode) {
                this._gainNode.gain.value = this.muted ? 0 : volume;
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

        if (this._speed !== speed) {
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

        if (this._muted !== muted) {
            this._muted = muted;

            if (this._gainNode) {
                this._gainNode.gain.value = muted ? 0 : this.volume;
            }
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
     * @member {?AudioContext}
     */
    get audioContext() {
        return audioContext;
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
     * @returns {Video}
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
     * @returns {Video}
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
     * @returns {Video}
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
     * @param {Object} [options]
     * @property {Number} [options.volume]
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
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
        if (this.visible) {
            this.texture.updateSource();

            super.render(renderManager);
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this.stop();

        if (support.webAudio) {
            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;
        }

        this._mediaSource = null;
        this._mediaElement = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
        this._muted = null;
    }
}
