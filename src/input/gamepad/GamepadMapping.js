/**
 * @class GamepadMapping
 * @memberof Exo
 */
export default class GamepadMapping {

    /**
     * @public
     * @member {Exo.GamepadButton[]}
     */
    get buttons() {
        return this._buttons;
    }

    set buttons(value) {
        this.setButtons(value);
    }

    /**
     * @public
     * @member {Exo.GamepadButton[]}
     */
    get axes() {
        return this._axes;
    }

    set axes(value) {
        this.setAxes(value);
    }

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Exo.GamepadButton[]}
         */
        this._buttons = [];

        /**
         * @private
         * @member {Exo.GamepadButton[]}
         */
        this._axes = [];
    }

    /**
     * @public
     * @param {Exo.GamepadButton[]} buttons
     */
    setButtons(buttons) {
        const mappingButtons = this._buttons;
        mappingButtons.length = 0;

        buttons.forEach((button) => {
            mappingButtons.push(button);
        });
    }

    /**
     * @public
     * @param {Exo.GamepadButton[]} axes
     */
    setAxes(axes) {
        const mappingAxes = this._axes;
        mappingAxes.length = 0;

        axes.forEach((axis) => {
            mappingAxes.push(axis);
        });
    }

    /**
     * @public
     */
    destroy() {
        this._buttons.length = 0;
        this._buttons = null;

        this._axes.length = 0;
        this._axes = null;
    }
}
