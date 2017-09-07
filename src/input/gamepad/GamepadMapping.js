/**
 * @class GamepadMapping
 * @memberof Exo
 */
export default class GamepadMapping {

    /**
     * @constructor
     * @param {Exo.GamepadControl[]} [buttons]
     * @param {Exo.GamepadControl[]} [axes]
     */
    constructor(buttons, axes) {

        /**
         * @private
         * @member {Set<Exo.GamepadControl>}
         */
        this._buttons = new Set(buttons);

        /**
         * @private
         * @member {Set<Exo.GamepadControl>}
         */
        this._axes = new Set(axes);
    }

    /**
     * @public
     * @member {Set<Exo.GamepadControl>}
     */
    get buttons() {
        return this._buttons;
    }

    set buttons(value) {
        this.setButtons(value);
    }

    /**
     * @public
     * @member {Set<Exo.GamepadControl>}
     */
    get axes() {
        return this._axes;
    }

    set axes(value) {
        this.setAxes(value);
    }

    /**
     * @public
     * @param {Exo.GamepadControl[]} buttons
     */
    setButtons(buttons) {
        this._buttons.clear();

        for (const button of buttons) {
            this._buttons.add(button);
        }
    }

    /**
     * @public
     * @param {Exo.GamepadControl[]} axes
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
