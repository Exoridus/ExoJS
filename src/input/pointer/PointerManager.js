import ChannelHandler from '../ChannelHandler';
import { RANGE_DEVICE, OFFSET_POINTER } from '../../const';

/**
 * @class PointerManager
 * @extends {ChannelHandler}
 */
export default class PointerManager extends ChannelHandler {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(app, channelBuffer) {
        super(channelBuffer, OFFSET_POINTER, RANGE_DEVICE);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = app.canvas;

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
    update() {

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
        this._app = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        const canvas = this._canvas;

        this._onPointerDownHandler = this._onPointerDown.bind(this);
        this._onPointerUpHandler = this._onPointerUp.bind(this);
        this._onPointerCancelHandler = this._onPointerCancel.bind(this);
        this._onPointerMoveHandler = this._onPointerMove.bind(this);
        this._onPointerOverHandler = this._onPointerOver.bind(this);
        this._onPointerOutHandler = this._onPointerOut.bind(this);
        this._onWheelHandler = this._onWheel.bind(this);
        this._stopEventHandler = this._stopEvent.bind(this);

        // Pointer events
        canvas.addEventListener('pointerdown', this._onPointerDownHandler, true);
        canvas.addEventListener('pointerup', this._onPointerUpHandler, true);
        canvas.addEventListener('pointercancel', this._onPointerCancelHandler, true);
        canvas.addEventListener('pointermove', this._onPointerMoveHandler, true);
        canvas.addEventListener('pointerover', this._onPointerOverHandler, true);
        canvas.addEventListener('pointerout', this._onPointerOutHandler, true);

        // Mouse events
        canvas.addEventListener('wheel', this._onWheelHandler, true);
        canvas.addEventListener('contextmenu', this._stopEventHandler, true);
        canvas.addEventListener('selectstart', this._stopEventHandler, true);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        const canvas = this._canvas;

        // Pointer events
        canvas.removeEventListener('pointerdown', this._onPointerDownHandler, true);
        canvas.removeEventListener('pointerup', this._onPointerUpHandler, true);
        canvas.removeEventListener('pointercancel', this._onPointerCancelHandler, true);
        canvas.removeEventListener('pointermove', this._onPointerMoveHandler, true);
        canvas.removeEventListener('pointerover', this._onPointerOverHandler, true);
        canvas.removeEventListener('pointerout', this._onPointerOutHandler, true);

        // Mouse specific
        canvas.removeEventListener('wheel', this._onWheelHandler, true);
        canvas.removeEventListener('contextmenu', this._stopEventHandler, true);
        canvas.removeEventListener('selectstart', this._stopEventHandler, true);

        this._onPointerDownHandler = null;
        this._onPointerUpHandler = null;
        this._onPointerCancelHandler = null;
        this._onPointerMoveHandler = null;
        this._onPointerOverHandler = null;
        this._onPointerOutHandler = null;
        this._stopEventHandler = null;
    }

    /**
     * @private
     * @param {Event} event
     */
    _stopEvent(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    _onPointerDown(event) {
        console.log('pointerdown', event);
    }

    _onPointerUp(event) {
        console.log('pointerup', event);
    }

    _onPointerCancel(event) {
        console.log('pointercancel', event);
    }

    _onPointerMove(event) {
        // console.log('pointermove', event);
    }

    _onPointerOver(event) {
        console.log('pointerover', event);
    }

    _onPointerOut(event) {
        console.log('pointerout', event);
    }

    _onWheel(event) {
        console.log('wheel', event);
    }
}
