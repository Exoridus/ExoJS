/**
 * @class InputDevice
 * @memberof Exo
 */
export default class InputDevice {

    /**
     * @public
     * @member {Number}
     */
    static get Keyboard() {
        return 0;
    }

    /**
     * @public
     * @member {Number}
     */
    static get Mouse() {
        return 1;
    }

    /**
     * @public
     * @member {Number}
     */
    static get Gamepad() {
        return 2;
    }

    /**
     * @public
     * @member {Number}
     */
    static get Pointer() {
        return 3;
    }
}
