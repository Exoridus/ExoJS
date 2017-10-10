import { clamp } from '../utils';
import Sprite from './Sprite';
import Texture from './Texture';
import support from '../support';

/**
 * @class Video
 * @extends {Playable}
 */
export default class Video extends Sprite {

    /**
     * @constructor
     * @param {HTMLVideoElement} videoElement
     */
    constructor(videoElement) {
        super(new Texture(videoElement));

        if (!support.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        /**
         * @private
         * @member {HTMLVideoElement}
         */
        this._source = videoElement;

        /**
         * @private
         * @member {?AudioContext}
         */
        this._audioContext = null;

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = null;

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
    }

    /**
     * @public
     * @readonly
     * @member {?AudioContext}
     */
    get audioContext() {
        return this._audioContext;
    }

    /**
     * @public
     * @readonly
     * @member {?GainNode}
     */
    get analyserTarget() {
        return this._gainNode;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLVideoElement}
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

        if (this._speed !== speed) {
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
     * @override
     */
    render(displayManager) {
        if (this.active) {
            this.texture.update();

            displayManager
                .getRenderer('sprite')
                .render(this);
        }

        return this;
    }

    /**
     * @public
     * @abstract
     * @param {MediaManager} mediaManager
     */
    connect(mediaManager) {
        if (this._audioContext) {
            return;
        }

        this._audioContext = mediaManager.audioContext;

        this._gainNode = this._audioContext.createGain();
        this._gainNode.connect(mediaManager.videoGain);
        this._gainNode.gain.value = this._volume;

        this._sourceNode = this._audioContext.createMediaElementSource(this.source);
        this._sourceNode.connect(this._gainNode);
    }

    /**
     * @public
     * @abstract
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
     * @abstract
     */
    pause() {
        if (this.playing) {
            this._source.pause();
            this.trigger('stop');
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
     * @abstract
     */
    destroy() {
        super.destroy();

        this.stop();

        if (this._audioContext) {
            this._audioContext = null;

            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;
        }

        this._source = null;
        this._duration = null;
        this._volume = null;
        this._speed = null;
        this._loop = null;
    }
}
