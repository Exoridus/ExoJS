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
         * @member {Map<Number, Pointer>}
         */
        this._pointers = new Map();

        this._addEventListeners();
    }

    /**
     * @public
     * @member {Map<Number, Pointer>}
     */
    get pointers() {
        return this._pointers;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();

        this._pointers.clear();
        this._pointers = null;

        this._canvas = null;
        this._game = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        const canvas = this._canvas;

        this._onTouchStartHandler = this._onTouchStart.bind(this);
        this._onTouchEndHandler = this._onTouchEnd.bind(this);
        this._onTouchMoveHandler = this._onTouchMove.bind(this);

        canvas.addEventListener('touchstart', this._onTouchStartHandler, true);
        canvas.addEventListener('touchend', this._onTouchEndHandler, true);
        canvas.addEventListener('touchmove', this._onTouchMoveHandler, true);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        const canvas = this._canvas;

        canvas.removeEventListener('touchstart', this._onTouchStartHandler, true);
        canvas.removeEventListener('touchend', this._onTouchEndHandler, true);
        canvas.removeEventListener('touchmove', this._onTouchMoveHandler, true);

        this._onTouchStartHandler = null;
        this._onTouchEndHandler = null;
        this._onTouchMoveHandler = null;
    }

    _onTouchStart(event) {
        console.log('touchdown', event);
    }

    _onTouchEnd(event) {
        console.log('touchup', event);
    }

    _onTouchMove(event) {
        console.log('touchmove', event);
    }
}
