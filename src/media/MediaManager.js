import { clamp } from '../utils';

/**
 * @class MediaManager
 */
export default class MediaManager {

    /**
     * @constructor
     * @param {Game} game
     * @param {Object} [options={}]
     * @param {Number} [options.masterVolume=1]
     * @param {Number} [options.musicVolume=1]
     * @param {Number} [options.soundVolume=1]
     * @param {Number} [options.videoVolume=1]
     */
    constructor(game, { masterVolume = 1, musicVolume = 1, soundVolume = 1, videoVolume = 1 } = {}) {

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {AudioContext}
         */
        this._context = new AudioContext();

        /**
         * @private
         * @member {AudioDestinationNode}
         */
        this._destination = this._context.destination;

        /**
         * @private
         * @member {DynamicsCompressorNode}
         */
        this._compressor = this._context.createDynamicsCompressor();
        this._compressor.connect(this._destination);

        /**
         * @private
         * @member {GainNode}
         */
        this._masterGain = this._context.createGain();
        this._masterGain.connect(this._compressor);

        /**
         * @private
         * @member {GainNode}
         */
        this._musicGain = this._context.createGain();
        this._musicGain.connect(this._masterGain);

        /**
         * @private
         * @member {GainNode}
         */
        this._soundGain = this._context.createGain();
        this._soundGain.connect(this._masterGain);

        /**
         * @private
         * @member {GainNode}
         */
        this._videoGain = this._context.createGain();
        this._videoGain.connect(this._masterGain);

        /**
         * @private
         * @member {Number}
         */
        this._masterVolume = null;

        /**
         * @private
         * @member {Number}
         */
        this._soundVolume = null;

        /**
         * @private
         * @member {Number}
         */
        this._musicVolume = null;

        /**
         * @private
         * @member {Number}
         */
        this._videoVolume = null;

        this.setMasterVolume(masterVolume);
        this.setSoundVolume(soundVolume);
        this.setMusicVolume(musicVolume);
        this.setVideoVolume(videoVolume);

        game.on('media:play', this.play, this)
            .on('media:volume:master', this.setMasterVolume, this)
            .on('media:volume:sound', this.setSoundVolume, this)
            .on('media:volume:music', this.setMusicVolume, this)
            .on('media:volume:video', this.setVideoVolume, this);
    }

    /**
     * @public
     * @readonly
     * @member {AudioContext}
     */
    get audioContext() {
        return this._context;
    }

    /**
     * @readonly
     * @member {GainNode}
     */
    get masterGain() {
        return this._masterGain;
    }

    /**
     * @readonly
     * @member {GainNode}
     */
    get soundGain() {
        return this._soundGain;
    }

    /**
     * @readonly
     * @member {GainNode}
     */
    get musicGain() {
        return this._musicGain;
    }

    /**
     * @readonly
     * @member {GainNode}
     */
    get videoGain() {
        return this._videoGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     */
    get analyserTarget() {
        return this._compressor;
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
    get videoVolume() {
        return this._videoVolume;
    }

    set videoVolume(volume) {
        this.setVideoVolume(volume);
    }

    /**
     * @public
     * @param {Music|Sound|Video} media
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.playbackRate]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     */
    play(media, options) {
        media.connect(this);
        media.play(options);
    }

    /**
     * @public
     * @param {Number} volume
     */
    setMasterVolume(volume) {
        const vol = clamp(volume, 0, 1);

        if (this._masterVolume !== vol) {
            this._masterGain.gain.value = this._masterVolume = vol;
        }
    }

    /**
     * @public
     * @param {Number} volume
     */
    setSoundVolume(volume) {
        const vol = clamp(volume, 0, 1);

        if (this._soundVolume !== vol) {
            this._soundGain.gain.value = this._soundVolume = volume;
        }
    }

    /**
     * @public
     * @param {Number} volume
     */
    setMusicVolume(volume) {
        const vol = clamp(volume, 0, 1);

        if (this._musicVolume !== vol) {
            this._musicGain.gain.value = this._musicVolume = vol;
        }
    }

    /**
     * @public
     * @param {Number} volume
     */
    setVideoVolume(volume) {
        const vol = clamp(volume, 0, 1);

        if (this._videoVolume !== vol) {
            this._videoGain.gain.value = this._videoVolume = vol;
        }
    }

    /**
     * @public
     */
    destroy() {
        this._game
            .off('media:play', this.play, this)
            .off('media:volume:master', this.setMasterVolume, this)
            .off('media:volume:sound', this.setSoundVolume, this)
            .off('media:volume:music', this.setMusicVolume, this);

        this._soundGain.disconnect();
        this._soundGain = null;

        this._musicGain.disconnect();
        this._musicGain = null;

        this._videoGain.disconnect();
        this._videoGain = null;

        this._masterGain.disconnect();
        this._masterGain = null;

        this._compressor.disconnect();
        this._compressor = null;

        this._context.close();
        this._context = null;

        this._masterVolume = null;
        this._soundVolume = null;
        this._musicVolume = null;
        this._videoVolume = null;
        this._destination = null;
        this._game = null;
    }
}
