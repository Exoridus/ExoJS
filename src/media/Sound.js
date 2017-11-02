import { clamp } from '../utils';
import support from '../support';
import Media from './Media';

/**
 * @class Sound
 * @extends Media
 */
export default class Sound extends Media {

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     */
    constructor(mediaSource) {
        super(mediaSource);

        /**
         * @private
         * @member {?AudioBuffer}
         */
        this._audioBuffer = mediaSource.audioBuffer;

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
         * @member {?AudioContext}
         */
        this._audioContext = null;

        /**
         * @private
         * @member {?AudioBufferSourceNode}
         */
        this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = null;
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
                this._gainNode.gain.value = volume;
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
        if (!this._startTime || !this._audioContext) {
            return 0;
        }

        return (this._currentTime + this._audioContext.currentTime - this._startTime);
    }

    set currentTime(currentTime) {
        this.pause();
        this._currentTime = Math.max(0, currentTime);
        this.play();
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
    get audioContext() {
        return this._audioContext || null;
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
            this._startTime = this._audioContext.currentTime;
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
        const sourceNode = this._audioContext.createBufferSource();

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
    connect(mediaManager) {
        if (support.webAudio && !this._audioContext) {
            this._audioContext = mediaManager.audioContext;

            this._gainNode = this._audioContext.createGain();
            this._gainNode.gain.value = this.volume;
            this._gainNode.connect(mediaManager.soundGain);
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        if (this._audioContext) {
            this._audioContext = null;

            if (this._sourceNode) {
                this._sourceNode.disconnect();
                this._sourceNode = null;
            }

            this._gainNode.disconnect();
            this._gainNode = null;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._audioBuffer = null;
        this._paused = null;
        this._startTime = null;
        this._currentTime = null;
    }
}
