import GamepadControl from './GamepadControl';
import { GAMEPAD } from '../const';

/**
 * @inner
 * @type {Object}
 */
const invert = { invert: true };

/**
 * @class GamepadMapping
 */
export default class GamepadMapping {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {GamepadControl[]} [options.buttons]
     * @param {GamepadControl[]} [options.axes]
     */
    constructor({
        buttons = [
            new GamepadControl(0, GAMEPAD.FaceBottom),
            new GamepadControl(1, GAMEPAD.FaceRight),
            new GamepadControl(2, GAMEPAD.FaceLeft),
            new GamepadControl(3, GAMEPAD.FaceTop),
            new GamepadControl(4, GAMEPAD.ShoulderLeftBottom),
            new GamepadControl(5, GAMEPAD.ShoulderRightBottom),
            new GamepadControl(6, GAMEPAD.ShoulderLeftTop),
            new GamepadControl(7, GAMEPAD.ShoulderRightTop),
            new GamepadControl(8, GAMEPAD.Select),
            new GamepadControl(9, GAMEPAD.Start),
            new GamepadControl(10, GAMEPAD.LeftStick),
            new GamepadControl(11, GAMEPAD.RightStick),
            new GamepadControl(12, GAMEPAD.DPadUp),
            new GamepadControl(13, GAMEPAD.DPadDown),
            new GamepadControl(14, GAMEPAD.DPadLeft),
            new GamepadControl(15, GAMEPAD.DPadRight),
            new GamepadControl(16, GAMEPAD.Home),
        ],
        axes = [
            new GamepadControl(0, GAMEPAD.LeftStickLeft, invert),
            new GamepadControl(0, GAMEPAD.LeftStickRight),
            new GamepadControl(1, GAMEPAD.LeftStickUp, invert),
            new GamepadControl(1, GAMEPAD.LeftStickDown),
            new GamepadControl(2, GAMEPAD.RightStickLeft, invert),
            new GamepadControl(2, GAMEPAD.RightStickRight),
            new GamepadControl(3, GAMEPAD.RightStickUp, invert),
            new GamepadControl(3, GAMEPAD.RightStickDown),
        ]
    } = {}) {

        /**
         * @private
         * @member {GamepadControl[]}
         */
        this._buttons = buttons;

        /**
         * @private
         * @member {GamepadControl[]}
         */
        this._axes = axes;
    }

    /**
     * @public
     * @member {GamepadControl[]}
     */
    get buttons() {
        return this._buttons;
    }

    /**
     * @public
     * @member {GamepadControl[]}
     */
    get axes() {
        return this._axes;
    }

    /**
     * @public
     * @chainable
     * @param {GamepadControl[]} buttons
     * @param {Boolean} [keepOther=false]
     * @returns {GamepadMapping}
     */
    setButtons(buttons, keepOther = false) {
        if (!keepOther) {
            this.clearButtons();
        }

        for (const button of buttons) {
            this._buttons.push(button);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GamepadMapping}
     */
    clearButtons() {
        for (const button of this._buttons) {
            button.destroy();
        }

        this._buttons.length = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {GamepadControl[]} axes
     * @param {Boolean} [keepOther=false]
     * @returns {GamepadMapping}
     */
    setAxes(axes, keepOther = false) {
        if (!keepOther) {
            this.clearAxes();
        }

        for (const axis of axes) {
            this._axes.push(axis);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GamepadMapping}
     */
    clearAxes() {
        for (const axis of this._axes) {
            axis.destroy();
        }

        this._axes.length = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GamepadMapping}
     */
    clearControls() {
        this.clearButtons();
        this.clearAxes();

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.clearControls();

        this._buttons = null;
        this._axes = null;
    }
}
