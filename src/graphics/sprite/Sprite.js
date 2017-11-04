import Container from '../Container';
import Rectangle from '../../math/Rectangle';

/**
 * @class Sprite
 * @extends Container
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
         * @private
         * @member {Rectangle}
         */
        this._textureFrame = new Rectangle();

        /**
         * 48 Bytes for 12 4-Byte Properties:
         *
         * X/Y Top-Left
         * X/Y Top-Right
         * X/Y Bottom-Left
         * X/Y Bottom-Right
         *
         * U/V Top-Left (Packed)
         * U/V Bottom-Right (Packed)
         *
         * @private
         * @type {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(48);

        /**
         * @private
         * @type {Float32Array}
         */
        this._positionData = new Float32Array(this._vertexData, 0, 8);

        /**
         * @private
         * @type {Uint32Array}
         */
        this._texCoordData = new Uint32Array(this._vertexData, 32, 4);

        /**
         * @private
         * @type {Boolean}
         */
        this._updateTexCoords = true;

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
    get textureFrame() {
        return this._textureFrame;
    }

    set textureFrame(frame) {
        this.setTextureFrame(frame);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return Math.abs(this.scale.x) * this._texture.width;
    }

    set width(value) {
        this.scale.x = value / this._texture.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this.scale.y) * this._texture.height;
    }

    set height(value) {
        this.scale.y = value / this._texture.height;
    }

    /**
     * @public
     * @chainable
     * @param {Texture} texture
     * @returns {Sprite}
     */
    setTexture(texture) {
        this._texture = texture;
        this.updateTexture();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} frame
     * @returns {Sprite}
     */
    setTextureFrame(frame) {
        this._textureFrame.copy(frame);
        this.localBounds.set(0, 0, frame.width, frame.height);
        this.scale.set(1, 1);

        this._updateTexCoords = true;

        return this;
    }

    /**
     * @override
     */
    render(displayManager) {
        if (this.active && displayManager.isVisible(this)) {
            const renderState = displayManager.renderState;

            renderState.renderer = displayManager.getRenderer('sprite');
            renderState.renderer.render(this);

            for (const child of this.children) {
                displayManager.render(child);
            }
        }

        return this;
    }

    /**
     * @public
     * @returns {Float32Array}
     */
    getPositionData() {
        this.updatePositionData();

        return this._positionData;
    }

    /**
     * @public
     * @chainable
     * @returns {Sprite}
     */
    updatePositionData() {
        const positionData = this._positionData,
            { left, top, right, bottom } = this.getLocalBounds(),
            { a, b, c, d, x, y } = this.getGlobalTransform();

        positionData[0] = (left * a) + (top * b) + x;
        positionData[1] = (left * c) + (top * d) + y;

        positionData[2] = (right * a) + (top * b) + x;
        positionData[3] = (right * c) + (top * d) + y;

        positionData[4] = (left * a) + (bottom * b) + x;
        positionData[5] = (left * c) + (bottom * d) + y;

        positionData[6] = (right * a) + (bottom * b) + x;
        positionData[7] = (right * c) + (bottom * d) + y;

        return this;
    }

    /**
     * @public
     * @returns {Uint32Array}
     */
    getTexCoordData() {
        if (this._updateTexCoords) {
            this.updateTexCoordData();
            this._updateTexCoords = false;
        }

        return this._texCoordData;
    }

    /**
     * @public
     * @chainable
     * @returns {Sprite}
     */
    updateTexCoordData() {
        const texCoordData = this._texCoordData,
            { left, top, right, bottom } = this._textureFrame,
            { width, height } = this._texture,
            minX = ((left / width) * 65535 & 65535),
            minY = ((top / height) * 65535 & 65535) << 16,
            maxX = ((right / width) * 65535 & 65535),
            maxY = ((bottom / height) * 65535 & 65535) << 16;

        texCoordData[0] = (minY | minX);
        texCoordData[1] = (minY | maxX);
        texCoordData[2] = (maxY | minX);
        texCoordData[3] = (maxY | maxX);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sprite}
     */
    updateTexture() {
        if (this._texture) {
            this._texture.updateSource();
            this.setTextureFrame(this._texture.sourceFrame);
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._texture = null;

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._vertexData = null;
        this._positionData = null;
        this._texCoordData = null;
        this._updateTexCoords = null;
    }
}
