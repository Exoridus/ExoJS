/**
 * @class Shapes
 * @memberof Exo
 */
export default class Shapes {

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    static get None() {
        return 0;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Point() {
        return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Circle() {
        return 2;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Rectangle() {
        return 3;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Polygon() {
        return 4;
    }
}
