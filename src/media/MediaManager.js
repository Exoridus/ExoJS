import { audioContext, clamp } from '../utils';
import support from '../support';

/**
 * @class MediaManager
 */
export default class MediaManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {Object} [options={}]
     * @param {Number} [options.masterVolume=1]
     * @param {Number} [options.musicVolume=1]
     * @param {Number} [options.soundVolume=1]
     * @param {Number} [options.videoVolume=1]
     */
    constructor(app, { masterVolume = 1, musicVolume = 1, soundVolume = 1, videoVolume = 1 } = {}) {

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Number}
         */
        this._masterVolume = clamp(masterVolume, 0, 1);

        /**
         * @private
         * @member {Number}
         */
        this._musicVolume = clamp(musicVolume, 0, 1);

        /**
         * @private
         * @member {Number}
         */
        this._soundVolume = clamp(soundVolume, 0, 1);

        /**
         * @private
         * @member {Number}
         */
        this._videoVolume = clamp(videoVolume, 0, 1);

        if (support.webAudio) {

            /**
             * @private
             * @member {DynamicsCompressorNode}
             */
            this._compressor = audioContext.createDynamicsCompressor();
            this._compressor.connect(audioContext.destination);

            /**
             * @private
             * @member {GainNode}
             */
            this._masterGain = audioContext.createGain();
            this._masterGain.gain.value = this._masterVolume;
            this._masterGain.connect(this._compressor);

            /**
             * @private
             * @member {GainNode}
             */
            this._musicGain = audioContext.createGain();
            this._musicGain.gain.value = this._musicVolume;
            this._musicGain.connect(this._masterGain);

            /**
             * @private
             * @member {GainNode}
             */
            this._soundGain = audioContext.createGain();
            this._soundGain.gain.value = this._soundVolume;
            this._soundGain.connect(this._masterGain);

            /**
             * @private
             * @member {GainNode}
             */
            this._videoGain = audioContext.createGain();
            this._videoGain.gain.value = this._videoVolume;
            this._videoGain.connect(this._masterGain);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get masterVolume() {
        return this._masterVolume;
    }

    set masterVolume(volume) {
        this.setMasterVolume(volume);
    }

    /**
     * @public
     * @member {Number}
     */
    get musicVolume() {
        return this._musicVolume;
    }

    set musicVolume(volume) {
        this.setMusicVolume(volume);
    }

    /**
     * @public
     * @member {Number}
     */
    get soundVolume() {
        return this._soundVolume;
    }

    set soundVolume(volume) {
        this.setSoundVolume(volume);
    }

    /**
     * @public
     * @member {Number}
     */
    get videoVolume() {
        return this._videoVolume;
    }

    set videoVolume(volume) {
        this.setVideoVolume(volume);
    }

    /**
     * @public
     * @readonly
     * @member {?DynamicsCompressorNode}
     */
    get compressor() {
        return this._compressor || null;
    }

    /**
     * @public
     * @readonly
     * @member {?GainNode}
     */
    get masterGain() {
        return this._masterGain || null;
    }

    /**
     * @public
     * @readonly
     * @member {?GainNode}
     */
    get musicGain() {
        return this._musicGain || null;
    }

    /**
     * @public
     * @readonly
     * @member {?GainNode}
     */
    get soundGain() {
        return this._soundGain || null;
    }

    /**
     * @public
     * @readonly
     * @member {?GainNode}
     */
    get videoGain() {
        return this._videoGain || null;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioNode}
     */
    get analyserTarget() {
        return this._compressor || null;
    }

    /**
     * @public
     * @chainable
     * @param {Media|Music|Sound|Video} media
     * @param {MediaOptions} [options]
     * @returns {MediaManager}
     */
    play(media, options) {
        media.connect(this);
        media.play(options);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} volume
     * @returns {MediaManager}
     */
    setMasterVolume(volume) {
        const value = clamp(volume, 0, 1);

        if (this._masterVolume !== value) {
            this._masterVolume = value;

            if (this._masterGain) {
                this._masterGain.gain.value = value;
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} volume
     * @returns {MediaManager}
     */
    setMusicVolume(volume) {
        const value = clamp(volume, 0, 1);

        if (this._musicVolume !== value) {
            this._musicVolume = value;

            if (this._musicGain) {
                this._musicGain.gain.value = value;
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} volume
     * @returns {MediaManager}
     */
    setSoundVolume(volume) {
        const value = clamp(volume, 0, 1);

        if (this._soundVolume !== value) {
            this._soundVolume = value;

            if (this._soundGain) {
                this._soundGain.gain.value = value;
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} volume
     * @returns {MediaManager}
     */
    setVideoVolume(volume) {
        const value = clamp(volume, 0, 1);

        if (this._videoVolume !== value) {
            this._videoVolume = value;

            if (this._videoGain) {
                this._videoGain.gain.value = value;
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (support.webAudio) {
            this._videoGain.disconnect();
            this._videoGain = null;

            this._soundGain.disconnect();
            this._soundGain = null;

            this._musicGain.disconnect();
            this._musicGain = null;

            this._masterGain.disconnect();
            this._masterGain = null;

            this._compressor.disconnect();
            this._compressor = null;
        }

        this._app = null;
        this._masterVolume = null;
        this._musicVolume = null;
        this._soundVolume = null;
        this._videoVolume = null;
    }
}
