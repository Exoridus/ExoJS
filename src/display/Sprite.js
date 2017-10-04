import Container from './Container';
import Rectangle from '../core/shape/Rectangle';

/**
 * @class Sprite
 * @extends {Container}
 */
export default class Sprite extends Container {

    /**
     * @constructor
     * @param {?Texture} texture
     */
    constructor(texture) {
        super();

        /**
         * @private
         * @member {?Texture}
         */
        this._texture = null;

        /**
         * 8 Properties:
         * X/Y/U/V from Top-Left Corner
         * X/Y/U/V from Bottom-Right Corner
         *
         * @private
         * @type {Float32Array}
         */
        this._vertexData = new Float32Array(16);

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureRect = new Rectangle();

        if (texture) {
            this.setTexture(texture);
        }
    }

    /**
     * @public
     * @member {Texture}
     */
    get texture() {
        return this._texture;
    }

    set texture(texture) {
        this.setTexture(texture);
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get textureRect() {
        return this._textureRect;
    }

    set textureRect(textureRect) {
        this.setTextureRect(textureRect);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return Math.abs(this._scale.x) * this._texture.width;
    }

    set width(value) {
        this._scale.x = value / this._texture.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this._scale.y) * this._texture.height;
    }

    set height(value) {
        this._scale.y = value / this._texture.height;
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
     * @chainable
     * @param {Texture} texture
     * @returns {Sprite}
     */
    setTexture(texture) {
        this._texture = texture;
        this.setTextureRect(texture.frame);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} rectangle
     * @returns {Sprite}
     */
    setTextureRect(rectangle) {
        this._textureRect.copy(rectangle);
        this._localBounds.set(0, 0, this._textureRect.width, this._textureRect.height);

        this._updatePositions();
        this._updateTexCoords();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sprite}
     */
    updateTexture() {
        this._texture.updateSource();

        return this;
    }

    /**
     * @override
     */
    render(displayManager) {
        if (this.active) {
            displayManager
                .getRenderer('sprite')
                .render(this);

            for (const child of this.children) {
                child.render(displayManager);
            }
        }

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
    }

    /**
     * @private
     */
    _updatePositions() {
        const vertexData = this._vertexData,
            bounds = this.getLocalBounds();

        vertexData[0] = bounds.x;
        vertexData[1] = bounds.y;
        vertexData[4] = bounds.width;
        vertexData[5] = bounds.height;
    }

    /**
     * @private
     */
    _updateTexCoords() {
        const vertexData = this._vertexData,
            texture = this._texture,
            textureRect = this._textureRect,
            left = (textureRect.x / texture.width),
            top = (textureRect.y / texture.height);

        vertexData[2] = left;
        vertexData[3] = top;
        vertexData[6] = left + (textureRect.width / texture.width);
        vertexData[7] = top + (textureRect.height / texture.height);
    }
}