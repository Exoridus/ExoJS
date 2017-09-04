/**
 * @class GamepadMapping
 * @memberof Exo
 */
export default class GamepadMapping {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Set.<Exo.GamepadButton>}
         */
        this._buttons = new Set();

        /**
         * @private
         * @member {Set.<Exo.GamepadButton>}
         */
        this._axes = new Set();
    }

    /**
     * @public
     * @member {Set<Exo.GamepadButton>}
     */
    get buttons() {
        return this._buttons;
    }

    set buttons(value) {
        this.setButtons(value);
    }

    /**
     * @public
     * @member {Set<Exo.GamepadButton>}
     */
    get axes() {
        return this._axes;
    }

    set axes(value) {
        this.setAxes(value);
    }

    /**
     * @public
     * @param {Exo.GamepadButton[]} buttons
     */
    setButtons(buttons) {
        this._buttons.clear();

        for (const button of buttons) {
            this._buttons.add(button);
        }
    }

    /**
     * @public
     * @param {Exo.GamepadButton[]} axes
     */
    setAxes(axes) {
        this._axes.clear();

        for (const axis of axes) {
            this._axes.add(axis);
        }
    }

    /**
     * @public
     */
    destroy() {
        this._buttons.clear();
        this._buttons = null;

        this._axes.clear();
        this._axes = null;
    }
}
