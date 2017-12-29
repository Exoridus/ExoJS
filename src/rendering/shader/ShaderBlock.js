

/**
 * @class ShaderBlock
 */
export default class ShaderBlock {

    /**
     * @constructor
     * @param {Object} options
     * @param {WebGL2RenderingContext} options.context
     * @param {Number} options.index
     * @param {String} options.name
     * @param {Number} options.size
     * @param {ArrayBuffer} [options.value=new ArrayBuffer(size)]
     * @param {Boolean} [options.usedByVertexShader=false]
     * @param {Boolean} [options.usedByFragmentShader=false]
     */
    constructor({ context, index, name, size, usedByVertexShader = false, usedByFragmentShader = false } = {}) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._size = size;

        console.log(size);

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._data = new ArrayBuffer(size);

        /**
         * @private
         * @member {Object<String, ShaderUniform>}
         */
        this._uniforms = {};

        /**
         * @private
         * @member {Boolean}
         */
        this._usedByVertexShader = usedByVertexShader;

        /**
         * @private
         * @member {Boolean}
         */
        this._usedByFragmentShader = usedByFragmentShader;
    }

    /**
     * @public
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    set index(index) {
        this._index = index;
    }

    /**
     * @public
     * @member {String}
     */
    get name() {
        return this._name;
    }

    set name(name) {
        this._name = name;
    }

    /**
     * @public
     * @member {Number}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size = size;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get usedByVertexShader() {
        return this._usedByVertexShader;
    }

    set usedByVertexShader(usedByVertexShader) {
        this._usedByVertexShader = usedByVertexShader;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get usedByFragmentShader() {
        return this._usedByFragmentShader;
    }

    set usedByFragmentShader(usedByFragmentShader) {
        this._usedByFragmentShader = usedByFragmentShader;
    }

    /**
     * @public
     * @member {ArrayBuffer}
     */
    get data() {
        return this._data;
    }

    set data(data) {
        this._data = data;
    }

    /**
     * @public
     * @member {Object<String, ShaderUniform>}
     */
    get uniforms() {
        return this._uniforms;
    }

    set uniforms(uniforms) {
        this._uniforms = uniforms;
    }

    /**
     * @public
     * @param {ShaderUniform} uniform
     */
    addUniform(uniform) {
        const prefix = `${this._name}.`.replace(/\[\d+\]\.$/, '.');

        if (uniform.name.startsWith(prefix)) {
            uniform.name = uniform.name.substr(prefix.length);
        }

        this._uniforms[uniform.name] = uniform;
    }

    /**
     * @public
     * @param {String} name
     * @returns {ShaderUniform}
     */
    getUniform(name) {
        if (!(name in this._uniforms)) {
            throw new Error(`Uniform "${name}" is not available in uniform block "${this._name}".`);
        }

        return this._uniforms[name];
    }

    /**
     * @public
     * @chainable
     * @param {*} value
     * @returns {ShaderBlock}
     */
    setValue(value) {
        // todo

        return this;
    }

    /**
     * @public
     */
    destroy() {
        for (const name of Object.keys(this._uniforms)) {
            this._uniforms[name].destroy();
            delete this._uniforms[name];
        }

        this._index = null;
        this._name = null;
        this._size = null;
        this._data = null;
        this._uniforms = null;
        this._usedByVertexShader = null;
        this._usedByFragmentShader = null;
        this._context = null;
    }
}
