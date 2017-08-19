/**
 * @class UniformType
 * @memberof Exo
 */
export default class UniformType {

    /**
     * @public
     * @static
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
    static get Int() {
        return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Float() {
        return 2;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Vector() {
        return 3;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get IntVector() {
        return 4;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Matrix() {
        return 5;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Texture() {
        return 6;
    }
}
