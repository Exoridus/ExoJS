import { audioContext, clamp } from '../utils';
import Sprite from '../graphics/sprite/Sprite';
import Texture from '../graphics/Texture';
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
     * @param {Object} [options={}]
     * @property {Number} [options.volume=settings.VOLUME_VIDEO]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     */
    constructor(mediaSource, {
        volume = settings.VOLUME_VIDEO,
        loop = settings.MEDIA_LOOP,
        speed = settings.MEDIA_SPEED,
        time = settings.MEDIA_TIME,
    } = {}) {
        super(new Texture(mediaSource.mediaElement));

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

        if (support.webAudio) {

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
        }

        this.applyOptions({ volume, loop, speed, time });
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
     * @param {MediaOptions} [options]
     * @returns {Video}
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
     * @override
     */
    render(displayManager) {
        if (this.active) {
            this.texture.updateSource();

            super.render(displayManager);
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
    }
}
