/**
 * @class ShaderUniform
 * @param {String} name
 * @param {Number} type
 * @memberof Exo
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} type
     */
    constructor(name, type) {

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._type = type;

        /**
         * @private
         * @member {?Number|?Number[]|?Exo.Vector|?Exo.Matrix|?Exo.Texture}
         */
        this._value = null;

        /**
         * @private
         * @member {?WebGLUniformLocation}
         */
        this._location = null;

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = -1;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._textureUnitChanged = false;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get name() {
        return this._name;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get type() {
        return this._type;
    }

    /**
     * @public
     * @member {WebGLUniformLocation}
     */
    get location() {
        return this._location;
    }

    set location(value) {
        this._location = value;
    }

    /**
     * @public
     * @member {Number|Number[]|Vector|Matrix|Texture}
     */
    get value() {
        return this._value;
    }

    set value(value) {
        this._value = value;
        this._dirty = true;
    }

    /**
     * @public
     * @member {Number}
     */
    get textureUnit() {
        return this._textureUnit;
    }

    set textureUnit(value) {
        if (this._textureUnit !== value) {
            this._textureUnit = value;
            this._textureUnitChanged = true;
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get dirty() {
        return this._dirty;
    }

    set dirty(value) {
        this._dirty = !!value;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get textureUnitChanged() {
        return this._textureUnitChanged;
    }

    set textureUnitChanged(value) {
        this._textureUnitChanged = !!value;
    }
    /**
     * @public
     */
    destroy() {
        this._location = null;
        this._value = null;
    }
}
