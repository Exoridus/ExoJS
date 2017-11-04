import { audioContext, clamp } from '../utils';
import support from '../support';
import Media from './Media';

/**
 * @class Music
 * @extends Media
 */
export default class Music extends Media {

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     */
    constructor(mediaSource) {
        super(mediaSource);

        if (!this.mediaElement) {
            throw new Error('MediaElement is missing in MediaSource');
        }

        /**
         * @private
         * @member {Number}
         */
        this._duration = this.mediaElement.duration;

        /**
         * @private
         * @member {Number}
         */
        this._volume = this.mediaElement.volume;

        /**
         * @private
         * @member {Number}
         */
        this._speed = this.mediaElement.playbackRate;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = this.mediaElement.loop;

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
    get analyserTarget() {
        return this._gainNode;
    }

    /**
     * @override
     */
    connect(mediaManager) {
        if (support.webAudio && !this._gainNode) {
            this._gainNode = audioContext.createGain();
            this._gainNode.gain.value = this.volume;
            this._gainNode.connect(mediaManager.musicGain);

            this._sourceNode = audioContext.createMediaElementSource(this.mediaElement);
            this._sourceNode.connect(this._gainNode);
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        if (this._sourceNode) {
            this._sourceNode.disconnect();
            this._sourceNode = null;
        }

        if (this._gainNode) {
            this._gainNode.disconnect();
            this._gainNode = null;
        }

        return this;
    }
}
