import Container from './Container';
import Rectangle from '../core/shape/Rectangle';
import Color from '../core/Color';

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
         * 4 vertices x 4 properties:
         * 2 = posCoordinates (x, y) +
         * 2 = texCoordinates (u, v)
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

        /**
         * @private
         * @member {Color}
         */
        this._tint = Color.White.clone();

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
     * @member {Color}
     */
    get tint() {
        return this._tint;
    }

    set tint(tint) {
        this._tint.copy(tint);
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
     * @override
     */
    setOrigin(x, y, absolute = false) {
        const bounds = this.getLocalBounds();

        if (absolute) {
            this.origin.set(x, y);
        } else {
            this.origin.set(x * bounds.width, y * bounds.height);
        }

        return this;
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
        if (!this._textureRect.equals(rectangle)) {
            this._textureRect.copy(rectangle);

            this.setSize(rectangle.width, rectangle.height);

            this._updatePositions();
            this._updateTexCoords();
        }

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
    render(displayManager, worldTransform) {
        if (this.visible) {
            const transform = this.worldTransform
                .copy(worldTransform)
                .multiply(this.getTransform());

            displayManager
                .getRenderer('sprite')
                .render(this);

            for (const child of this.children) {
                child.render(displayManager, transform);
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

        this._tint.destroy();
        this._tint = null;
    }

    /**
     * @private
     */
    _updatePositions() {
        const vertexData = this._vertexData,
            bounds = this.getLocalBounds();

        vertexData[0] = vertexData[5] = bounds.x;
        vertexData[1] = vertexData[8] = bounds.y;
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
            left = (textureRect.x / texture.width),
            top = (textureRect.y / texture.height);

        vertexData[2] = vertexData[10] = left;
        vertexData[3] = vertexData[7] = top;
        vertexData[6] = vertexData[14] = left + (textureRect.width / texture.width);
        vertexData[11] = vertexData[15] = top + (textureRect.height / texture.height);
    }
}
