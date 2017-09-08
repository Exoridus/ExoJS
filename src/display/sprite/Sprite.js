import Renderable from '../Renderable';
import Rectangle from '../../core/Rectangle';
import Color from '../../core/Color';
import ObservableVector from '../../core/ObservableVector';

/**
 * @class Sprite
 * @extends {Exo.Renderable}
 * @memberof Exo
 */
export default class Sprite extends Renderable {

    /**
     * @constructor
     * @param {?Exo.Texture} texture
     */
    constructor(texture) {
        super();

        /**
         * @private
         * @member {?Exo.Texture}
         */
        this._texture = null;

        /**
         * 4 vertices with 5 properties:
         *
         * 2 = posCoordinates (x, y) +
         * 2 = texCoordinates (u, v) +
         * 1 = color     (ARGB uint)
         *
         * @private
         * @type {Float32Array}
         */
        this._vertexData = new Float32Array(20);

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._textureRect = new Rectangle();

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._size = new ObservableVector(this._updatePositions, this);

        /**
         * @private
         * @member {Exo.Color}
         */
        this._tint = Color.White.clone();

        if (texture) {
            this.texture = texture;
        }
    }

    /**
     * @public
     * @member {Exo.Texture}
     */
    get texture() {
        return this._texture;
    }

    set texture(value) {
        this.setTexture(value)
    }

    /**
     * @public
     * @member {Exo.Rectangle}
     */
    get textureRect() {
        return this._textureRect;
    }

    set textureRect(value) {
        this.setTextureRect(value);
    }

    /**
     * @public
     * @member {Exo.Color}
     */
    get tint() {
        return this._tint;
    }

    set tint(value) {
        this._tint.copy(value);
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get vertexData() {
        return this._vertexData;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Rectangle}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get size() {
        return this._size;
    }

    set size(value) {
        this._size.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(value) {
        this._size.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(value) {
        this._size.y = value;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get top() {
        return this.y - this.height + this.origin.y;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return this.y + this.height + this.origin.y;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return this.x - this.width + this.origin.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return this.x + this.width + this.origin.x;
    }

    /**
     * @override
     */
    getBounds() {
        return this._bounds.set(this.x, this.y, this.width, this.height);
    }

    /**
     * @override
     */
    setOrigin(x, y, absolute = false) {
        const bounds = this.bounds;

        this._dirtyTransform = true;

        if (absolute) {
            this._origin.set(x, y);
        } else {
            this._origin.set(x * bounds.width, y * bounds.height);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {Exo.Sprite}
     */
    setSize(width, height) {
        this._size.set(width, height);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Rectangle} rectangle
     * @param {Boolean} [updateSize=true]
     * @returns {Exo.Sprite}
     */
    setTextureRect(rectangle, updateSize = true) {
        this._textureRect.copy(rectangle);

        if (updateSize) {
            this.setSize(rectangle.width, rectangle.height);
        }

        this._updatePositions();
        this._updateTexCoords();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Rectangle} rectangle
     * @param {Boolean} [updateSize=true]
     * @returns {Exo.Sprite}
     */
    setTexture(texture) {
        this._texture = texture;
        this.setTextureRect(texture.frame);

        return this;
    }

    /**
     * @override
     */
    render(displayManager, parentTransform) {
        if (!this.visible) {
            return this;
        }

        this._worldTransform.copy(parentTransform);
        this._worldTransform.multiply(this.transform);

        displayManager.getRenderer('sprite').render(this);

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._texture = null;
        this._vertexData = null;

        this._textureRect.destroy();
        this._textureRect = null;

        this._size.destroy();
        this._size = null;

        this._tint.destroy();
        this._tint = null;
    }

    /**
     * @private
     */
    _updatePositions() {
        const vertexData = this._vertexData,
            bounds = this.getBounds();

        vertexData[0] = vertexData[1] = vertexData[5] = vertexData[8] = 0;
        vertexData[4] = vertexData[12] = bounds.width;
        vertexData[9] = vertexData[13] = bounds.height;
    }

    /**
     * @private
     */
    _updateTexCoords() {
        const vertexData = this._vertexData,
            texture = this._texture,
            textureRect = this._textureRect,
            left = textureRect.x / texture.width,
            top = textureRect.y / texture.height;

        vertexData[2] = vertexData[10] = left;
        vertexData[3] = vertexData[7] = top;
        vertexData[6] = vertexData[14] = left + (textureRect.width / texture.width);
        vertexData[11] = vertexData[15] = top + (textureRect.height / texture.height);
    }
}
