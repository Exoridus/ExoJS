import { clamp } from '../utils';
import Sprite from '../display/Sprite';
import Texture from '../display/Texture';

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
        return this._source.duration;
    }

    /**
     * @override
     */
    get volume() {
        return this._audioContext ? this._gainNode.gain.value : 1;
    }

    set volume(volume) {
        if (this._audioContext) {
            this._gainNode.gain.value = clamp(volume, 0, 1);
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
     * @readonly
     * @member {?GainNode}
     */
    get analyserTarget() {
        return this._gainNode;
    }

    /**
     * @override
     */
    render(displayManager, parentTransform) {
        if (!this.visible) {
            return this;
        }

        this.updateTexture();

        this.worldTransform.copy(parentTransform);
        this.worldTransform.multiply(this.transform);

        displayManager
            .getRenderer('sprite')
            .render(this);

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

        this._sourceNode = this._audioContext.createMediaElementSource(this._source);
        this._sourceNode.connect(this._gainNode);
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
        super.destroy();

        this.stop();

        this._source = null;

        if (this._audioContext) {
            this._audioContext = null;

            this._sourceNode.disconnect();
            this._sourceNode = null;

            this._gainNode.disconnect();
            this._gainNode = null;
        }
    }
}
