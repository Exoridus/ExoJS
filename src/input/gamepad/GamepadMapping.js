/**
 * @class GamepadMapping
 */
export default class GamepadMapping {

    /**
     * @constructor
     * @param {GamepadControl[]} [buttons]
     * @param {GamepadControl[]} [axes]
     */
    constructor(buttons, axes) {

        /**
         * @private
         * @member {Set<GamepadControl>}
         */
        this._buttons = new Set(buttons);

        /**
         * @private
         * @member {Set<GamepadControl>}
         */
        this._axes = new Set(axes);
    }

    /**
     * @public
     * @member {Set<GamepadControl>}
     */
    get buttons() {
        return this._buttons;
    }

    set buttons(buttons) {
        this.setButtons(buttons);
    }

    /**
     * @public
     * @member {Set<GamepadControl>}
     */
    get axes() {
        return this._axes;
    }

    set axes(axes) {
        this.setAxes(axes);
    }

    /**
     * @public
     * @param {GamepadControl[]} buttons
     */
    setButtons(buttons) {
        this._buttons.clear();

        for (const button of buttons) {
            this._buttons.add(button);
        }
    }

    /**
     * @public
     * @param {GamepadControl[]} axes
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
