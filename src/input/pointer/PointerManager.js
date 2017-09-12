import ChannelHandler from '../ChannelHandler';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../../const';

/**
 * @class PointerManager
 * @extends {ChannelHandler}
 */
export default class PointerManager extends ChannelHandler {

    /**
     * @constructor
     * @param {Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.POINTER, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = game.canvas;

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointers = [];

        this._addEventListeners();
    }

    getPointers() {
        return this._pointers;
    }

    /**
     * @param {Number} index
     * @returns {Pointer}
     */
    getPointer(index) {
        return this._pointers[index];
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();
        this._game = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        this._onTouchStartHandler = this._onTouchStart.bind(this);
        this._onTouchEndHandler = this._onTouchEnd.bind(this);
        this._onTouchMoveHandler = this._onTouchMove.bind(this);

        this._canvas.addEventListener('touchstart', this._onTouchStartHandler, true);
        this._canvas.addEventListener('touchend', this._onTouchEndHandler, true);
        this._canvas.addEventListener('touchmove', this._onTouchMoveHandler, true);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        this._canvas.removeEventListener('touchstart', this._onTouchStartHandler, true);
        this._canvas.removeEventListener('touchend', this._onTouchEndHandler, true);
        this._canvas.removeEventListener('touchmove', this._onTouchMoveHandler, true);

        this._onTouchStartHandler = null;
        this._onTouchEndHandler = null;
        this._onTouchMoveHandler = null;
    }

    _onTouchStart(event) {
        if (!this.active) {
            return;
        }

        console.log('touchdown', event);
    }

    _onTouchEnd(event) {
        if (!this.active) {
            return;
        }

        console.log('touchup', event);
    }

    _onTouchMove(event) {
        if (!this.active) {
            return;
        }

        console.log('touchmove', event);
    }
}
