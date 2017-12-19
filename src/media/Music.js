import { audioContext } from '../utils/media';
import { clamp } from '../utils/math';
import Media from './Media';
import settings from '../settings';

/**
 * @class Music
 * @extends Media
 */
export default class Music extends Media {

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     * @param {Object} [options]
     * @property {Number} [options.volume=settings.VOLUME_MUSIC]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
     */
    constructor(mediaSource, {
        volume = settings.VOLUME_MUSIC,
        loop = settings.MEDIA_LOOP,
        speed = settings.MEDIA_SPEED,
        time = settings.MEDIA_TIME,
        muted = settings.MEDIA_MUTED,
    } = {}) {
        super(mediaSource, { volume, loop, speed, time, muted });

        const mediaElement = this.mediaElement;

        if (!mediaElement) {
            throw new Error('MediaElement is missing in MediaSource');
        }

        /**
         * @private
         * @member {Number}
         */
        this._duration = mediaElement.duration;

        /**
         * @private
         * @member {Number}
         */
        this._volume = mediaElement.volume;

        /**
         * @private
         * @member {Number}
         */
        this._speed = mediaElement.playbackRate;

        /**
         * @private
         * @member {Boolean}
         */
        this._loop = mediaElement.loop;

        /**
         * @private
         * @member {Boolean}
         */
        this._muted = mediaElement.muted;

        /**
         * @private
         * @member {?GainNode}
         */
        this._gainNode = audioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.volume, audioContext.currentTime, 10);
        this._gainNode.connect(audioContext.destination);

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        this._sourceNode = audioContext.createMediaElementSource(this.mediaElement);
        this._sourceNode.connect(this._gainNode);
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
                this._gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 10);
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
    destroy() {
        super.destroy();

        this._sourceNode.disconnect();
        this._sourceNode = null;

        this._gainNode.disconnect();
        this._gainNode = null;
    }
}
