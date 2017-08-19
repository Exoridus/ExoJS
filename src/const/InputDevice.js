/**
 * @class InputDevice
 * @memberof Exo
 */
export default class InputDevice {

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Keyboard() {
        return 0;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Mouse() {
        return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Gamepad() {
        return 2;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Pointer() {
        return 3;
    }
}
