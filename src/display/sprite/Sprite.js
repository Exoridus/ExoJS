import Drawable from '../Drawable';
import Rectangle from '../../core/Rectangle';
import Color from '../../core/Color';
import ObservableVector from '../../core/ObservableVector';

/**
 * @class Sprite
 * @extends {Exo.Drawable}
 * @memberof Exo
 */
export default class Sprite extends Drawable {

    /**
     * @constructor
     * @param {Exo.Texture|HTMLImageElement|HTMLCanvasElement} texture
     */
    constructor(texture) {
        super();

        /**
         * @private
         * @member {Exo.Texture|null}
         */
        this._texture = null;

        /**
         * 4 vertices with 5 properties:
         *
         * 2 = posCoordinates (x, y) +
         * 2 = texCoordinates (x, y) +
         * 1 = color      (ARGB int)
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
     * @readonly
     * @member {Float32Array}
     */
    get vertexData() {
        return this._vertexData;
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
        return this.y - (this.height - this._origin.y);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return this.y + (this.height - this._origin.y);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return this.x - (this.width * this._origin.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return this.x + (this.width * (1 - this._origin.x));
    }

    /**
     * @public
     * @member {Exo.Texture}
     */
    get texture() {
        return this._texture;
    }

    set texture(value) {
        this._texture = value;

        this.setTextureRect(new Rectangle(0, 0, this._texture.width, this._texture.height));
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
     * @param {Exo.Rectangle} rectangle
     * @param {Boolean} [keepSize]
     */
    setTextureRect(rectangle, keepSize) {
        this._textureRect.copy(rectangle);

        if (!keepSize) {
            this._size.set(rectangle.width, rectangle.height);
        }

        this._updatePositions();
        this._updateTexCoords();
    }

    /**
     * @override
     * @returns {Exo.Rectangle}
     */
    getLocalBounds() {
        return new Rectangle(0, 0, this.width, this.height);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @param {Boolean} [absolute=false]
     */
    setOrigin(x, y, absolute = false) {
        const bounds = this.getLocalBounds(),
            origin = this._origin;

        this._dirtyTransform = true;

        if (absolute) {
            origin.x = x;
            origin.y = y;

            return;
        }

        origin.x = x * bounds.width;
        origin.y = y * bounds.height;
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     */
    setSize(width, height) {
        this._size.set(width, height);
    }

    /**
     * @override
     */
    draw(displayManager, parentTransform) {
        if (!this.visible) {
            return;
        }

        this._worldTransform.copy(parentTransform);
        this._worldTransform.multiply(this.transform);

        displayManager.setCurrentRenderer('sprite');
        displayManager.getCurrentRenderer().draw(this);
    }

    /**
     * @override
     * @param {Boolean} [destroyTexture]
     */
    destroy(destroyTexture) {
        super.destroy();

        if (destroyTexture && this._texture) {
            this._texture.destroy();
        }

        this._vertexData.fill(0);
        this._vertexData = null;

        this._texture = null;
        this._textureRect = null;
        this._size = null;
    }

    /**
     * @private
     */
    _updatePositions() {
        const vertexData = this._vertexData,
            bounds = this.getLocalBounds();

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
