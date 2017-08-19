import { clamp } from '../core/Utils';

/**
 * @class AudioManager
 * @memberof Exo
 */
export default class AudioManager {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    constructor(game) {

        /**
         * @private
         * @member {Exo.Game}
         * @memberof Exo.AudioManager
         */
        this._game = game;

        /**
         * @private
         * @member {AudioContext}
         * @memberof Exo.AudioManager
         */
        this._context = new AudioContext();

        /**
         * @private
         * @member {AudioDestinationNode}
         * @memberof Exo.AudioManager
         */
        this._destination = this._context.destination;

        /**
         * @private
         * @member {DynamicsCompressorNode}
         * @memberof Exo.AudioManager
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
         * @member {Number}
         */
        this._masterVolume = 1;

        /**
         * @private
         * @member {Number}
         */
        this._musicVolume = 1;

        /**
         * @private
         * @member {Number}
         */
        this._soundVolume = 1;

        game.on('audio:play', this.play, this)
            .on('audio:volume:master', this.setMasterVolume, this)
            .on('audio:volume:sound', this.setSoundVolume, this)
            .on('audio:volume:music', this.setMusicVolume, this);
    }

    /**
     * @public
     * @readonly
     * @member {AudioContext}
     * @memberof Exo.AudioManager
     */
    get context() {
        return this._context;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */
    get masterNode() {
        return this._masterGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */
    get musicNode() {
        return this._musicGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */
    get soundNode() {
        return this._soundGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */
    get analyserTarget() {
        return this._compressor;
    }

    /**
     * @public
     * @member {Number}
     * @memberof Exo.AudioManager
     */
    get masterVolume() {
        return this._masterVolume;
    }

    set masterVolume(value) {
        this.setMasterVolume(value);
    }

    /**
     * @public
     * @member {Number}
     * @memberof Exo.AudioManager
     */
    get soundVolume() {
        return this._soundVolume;
    }

    set soundVolume(value) {
        this.setSoundVolume(value);
    }

    /**
     * @public
     * @member {Number}
     * @memberof Exo.AudioManager
     */
    get musicVolume() {
        return this._musicVolume;
    }

    set musicVolume(value) {
        this.setMusicVolume(value);
    }

    /**
     * @public
     * @param {Exo.Music|Exo.Sound|Exo.Audio|Exo.Playable} playable
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.playbackRate]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     */
    play(playable, options) {
        playable.connect(this);
        playable.play(options);
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
     */
    destroy() {
        this._destination = null;

        this._soundGain.disconnect();
        this._soundGain = null;

        this._musicGain.disconnect();
        this._musicGain = null;

        this._masterGain.disconnect();
        this._masterGain = null;

        this._compressor.disconnect();
        this._compressor = null;

        this._context.close();
        this._context = null;

        this._game
            .off('audio:play', this.play, this)
            .off('audio:volume:master', this.setMasterVolume, this)
            .off('audio:volume:sound', this.setSoundVolume, this)
            .off('audio:volume:music', this.setMusicVolume, this);

        this._game = null;
    }
}
