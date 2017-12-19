import { audioContext } from '../utils/media';
import { clamp } from '../utils/math';
import support from '../support';
import Media from './Media';
import settings from '../settings';

/**
 * @class Sound
 * @extends Media
 */
export default class Sound extends Media {

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     * @param {Object} [options]
     * @property {Number} [options.volume=settings.VOLUME_SOUND]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
     */
    constructor(mediaSource, {
        volume = settings.VOLUME_SOUND,
        loop = settings.MEDIA_LOOP,
        speed = settings.MEDIA_SPEED,
        time = settings.MEDIA_TIME,
        muted = settings.MEDIA_MUTED,
    } = {}) {
        super(mediaSource, { volume, loop, speed, time, muted });

        const audioBuffer = this.audioBuffer;

        if (!audioBuffer) {
            throw new Error('AudioBuffer is missing in MediaSource');
        }

        /**
         * @private
         * @member {AudioBuffer}
         */
        this._audioBuffer = audioBuffer;

        /**
         * @private
         * @member {Number}
         */
        this._duration = audioBuffer.duration;

        /**
         * @private
         * @member {Boolean}
         */
        this._paused = true;

        /**
         * @private
         * @member {Number}
         */
        this._startTime = 0;

        /**
         * @private
         * @member {Number}
         */
        this._currentTime = 0;

        /**
         * @private
         * @member {?AudioBufferSourceNode}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = audioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.volume, audioContext.currentTime, 10);
        this._gainNode.connect(audioContext.destination);
    }

    /**
     * @override
     */
    get volume() {
        return this._volume;
    }

    set volume(value) {
        const volume = clamp(value, 0, 2);

        if (this._volume !== volume) {
            this._volume = volume;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, audioContext.currentTime, 10);
            }
        }
    }

    /**
     * @override
     */
    set loop(value) {
        const loop = !!value;

        if (this._loop !== loop) {
            this._loop = loop;

            if (this._sourceNode) {
                this._sourceNode.loop = loop;
            }
        }
    }

    /**
     * @override
     */
    set speed(value) {
        const speed = Math.max(0, value);

        if (this._speed !== speed) {
            this._speed = speed;

            if (this._sourceNode) {
                this._sourceNode.playbackRate.value = speed;
            }
        }
    }

    /**
     * @override
     */
    get currentTime() {
        if (!this._startTime || !audioContext) {
            return 0;
        }

        return (this._currentTime + audioContext.currentTime - this._startTime);
    }

    set currentTime(currentTime) {
        this.pause();
        this._currentTime = Math.max(0, currentTime);
        this.play();
    }

    /**
     * @override
     */
    set muted(value) {
        const muted = !!value;

        if (this._muted !== muted) {
            this._muted = muted;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, audioContext.currentTime, 10);
            }
        }
    }

    /**
     * @override
     */
    get paused() {
        if (!this._paused || this._loop) {
            return false;
        }

        return (this.currentTime >= this.duration);
    }

    /**
     * @override
     */
    get playing() {
        return !this._paused;
    }

    /**
     * @override
     */
    get analyserTarget() {
        return this._gainNode || null;
    }

    /**
     * @override
     */
    play(options) {
        if (this._paused) {
            this.applyOptions(options);

            this._sourceNode = this.createSourceNode();
            this._startTime = audioContext.currentTime;
            this._paused = false;

            this.trigger('start');
        }

        return this;
    }

    /**
     * @public
     * @returns {AudioBufferSourceNode}
     */
    createSourceNode() {
        const sourceNode = audioContext.createBufferSource();

        sourceNode.buffer = this.mediaSource.audioBuffer;
        sourceNode.loop = this.loop;
        sourceNode.playbackRate.value = this.speed;
        sourceNode.connect(this._gainNode);
        sourceNode.start(0, this._currentTime);

        return sourceNode;
    }

    /**
     * @override
     */
    pause() {
        if (!this._paused) {
            const duration = this.duration,
                currentTime = this.currentTime;

            if (currentTime <= duration) {
                this._currentTime = currentTime;
            } else {
                this._currentTime = (currentTime - duration) * ((currentTime / duration) | 0);
            }

            this._sourceNode.stop(0);
            this._sourceNode.disconnect();
            this._sourceNode = null;
            this._paused = true;

            this.trigger('stop');
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._sourceNode.disconnect();
        this._sourceNode = null;

        this._gainNode.disconnect();
        this._gainNode = null;

        this._audioBuffer = null;
        this._paused = null;
        this._startTime = null;
        this._currentTime = null;
    }
}
