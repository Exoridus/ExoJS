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
     * @readonly
     * @member {Float32Array}
     */
    get positionData() {
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

        return positionData;
    }

    /**
     * @public
     * @readonly
     * @member {Uint32Array}
     */
    get texCoordData() {
        if (this._updateTexCoords) {
            const { left, top, right, bottom } = this._textureFrame,
                { width, height } = this._texture,
                minX = ((left / width) * 65535 & 65535),
                minY = ((top / height) * 65535 & 65535) << 16,
                maxX = ((right / width) * 65535 & 65535),
                maxY = ((bottom / height) * 65535 & 65535) << 16;

            this._texCoordData[0] = (minY | minX);
            this._texCoordData[1] = (minY | maxX);
            this._texCoordData[2] = (maxY | minX);
            this._texCoordData[3] = (maxY | maxX);

            this._updateTexCoords = false;
        }

        return this._texCoordData;
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return Math.abs(this.scale.x) * this._textureFrame.width;
    }

    set width(value) {
        this.scale.x = value / this._textureFrame.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this.scale.y) * this._textureFrame.height;
    }

    set height(value) {
        this.scale.y = value / this._textureFrame.height;
    }

    /**
     * @public
     * @chainable
     * @param {Texture} texture
     * @returns {Sprite}
     */
    setTexture(texture) {
        if (this._texture !== texture) {
            this._texture = texture;
            this.updateTexture();
        }

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
     * @public
     * @chainable
     * @param {Rectangle} frame
     * @param {Boolean} [resetSize=true]
     * @returns {Sprite}
     */
    setTextureFrame(frame, resetSize = true) {
        const width = this.width,
            height = this.height;

        this._textureFrame.copy(frame);
        this._updateTexCoords = true;

        this.localBounds.set(0, 0, frame.width, frame.height);

        if (resetSize) {
            this.width = frame.width;
            this.height = frame.height;
        } else {
            this.width = width;
            this.height = height;
        }

        return this;
    }

    /**
     * @override
     */
    render(displayManager) {
        if (this.active && displayManager.isVisible(this)) {
            displayManager
                .setRenderer('sprite')
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

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._vertexData = null;
        this._positionData = null;
        this._texCoordData = null;
        this._updateTexCoords = null;
    }
}
