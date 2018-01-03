import Container from '../Container';
import Rectangle from '../../math/Rectangle';
import Vector from '../../math/Vector';
import Interval from '../../math/Interval';
import { FLAGS } from '../../const/core';

/**
 * @class Sprite
 * @extends Container
 */
export default class Sprite extends Container {

    /**
     * @constructor
     * @param {?Texture|?RenderTexture} texture
     */
    constructor(texture) {
        super();

        /**
         * @private
         * @member {?Texture|?RenderTexture}
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
         * U/V Top-Left (Packed)
         * U/V Bottom-Right (Packed)
         *
         * @private
         * @type {ArrayBuffer}
         */
        this._spriteData = new ArrayBuffer(48);

        /**
         * @private
         * @type {Float32Array}
         */
        this._positionData = new Float32Array(this._spriteData);

        /**
         * @private
         * @type {Uint32Array}
         */
        this._texCoordData = new Uint32Array(this._spriteData, 32, 4);

        if (texture) {
            this.setTexture(texture);
        }
    }

    /**
     * @public
     * @member {?Texture|?RenderTexture}
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
        this.updatePositions();

        return this._positionData;
    }

    /**
     * @public
     * @readonly
     * @member {Uint32Array}
     */
    get texCoordData() {
        this.updateTexCoords();

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
        const scaleX = (value / this._textureFrame.width);

        if (this.scale.x !== scaleX) {
            this.scale.x = scaleX;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this.scale.y) * this._textureFrame.height;
    }

    set height(value) {
        const scaleY = (value / this._textureFrame.height);

        if (this.scale.y !== scaleY) {
            this.scale.y = scaleY;
        }
    }

    /**
     * @public
     * @chainable
     * @param {?Texture|?RenderTexture} texture
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
            this.resetTextureFrame();
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
        this.flags.add(FLAGS.TEXTURE_COORDS);
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
     * @public
     * @chainable
     * @returns {Sprite}
     */
    resetTextureFrame() {
        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer('sprite');

            renderManager.setRenderer(renderer);
            renderer.render(this);

            for (const child of this.children) {
                child.render(renderManager);
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sprite}
     */
    updatePositions() {
        const { left, top, right, bottom } = this.getLocalBounds(),
            { a, b, c, d, x, y } = this.getGlobalTransform();

        this._positionData[0] = (left * a) + (top * b) + x;
        this._positionData[1] = (left * c) + (top * d) + y;

        this._positionData[2] = (right * a) + (top * b) + x;
        this._positionData[3] = (right * c) + (top * d) + y;

        this._positionData[4] = (right * a) + (bottom * b) + x;
        this._positionData[5] = (right * c) + (bottom * d) + y;

        this._positionData[6] = (left * a) + (bottom * b) + x;
        this._positionData[7] = (left * c) + (bottom * d) + y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sprite}
     */
    updateTexCoords() {
        if (this.flags.has(FLAGS.TEXTURE_COORDS)) {
            const { width, height } = this._texture,
                { left, top, right, bottom } = this._textureFrame,
                minX = ((left / width) * 65535 & 65535),
                minY = ((top / height) * 65535 & 65535) << 16,
                maxX = ((right / width) * 65535 & 65535),
                maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
                this._texCoordData[0] = (maxY | minX);
                this._texCoordData[1] = (maxY | maxX);
                this._texCoordData[2] = (minY | maxX);
                this._texCoordData[3] = (minY | minX);
            } else {
                this._texCoordData[0] = (minY | minX);
                this._texCoordData[1] = (minY | maxX);
                this._texCoordData[2] = (maxY | maxX);
                this._texCoordData[3] = (maxY | minX);
            }

            this.flags.remove(FLAGS.TEXTURE_COORDS);
        }

        return this;
    }

    /**
     * todo - cache this
     *
     * @public
     * @returns {Vector[]}
     */
    getNormals() {
        const normals = [],
            positions = this.positionData,
            len = positions.length;

        for (let i = 0; i < len; i += 2) {
            normals.push(
                new Vector(
                    positions[(i + 2) % len] - positions[i + 0],
                    positions[(i + 3) % len] - positions[i + 1]
                ).perpLeft().normalize()
            );
        }

        return normals;
    }

    /**
     * @public
     * @param {Vector} axis
     * @param {Interval} [result=new Interval()]
     * @returns {Interval}
     */
    project(axis, result = new Interval()) {
        const positions = this.positionData,
            len = positions.length;

        let min = axis.dot(positions[0], positions[1]),
            max = min;

        for (let i = 2; i < len; i += 2) {
            const projection = axis.dot(positions[i], positions[i + 1]);

            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }

        return result.set(min, max);
    }

    /**
     * @override
     */
    contains(x, y) {
        if ((this.rotation % 90 === 0)) {
            return this.getBounds().contains(x, y);
        }

        const [x1, y1, x2, y2, x3, y3] = this.positionData,
            vecA = Vector.Temp.set(x2 - x1, y2 - y1),
            dotA = vecA.dot(x - x1, y - y1),
            lenA = vecA.len2,
            vecB = Vector.Temp.set(x3 - x2, y3 - y2),
            dotB = vecB.dot(x - x2, y - y2),
            lenB = vecB.len2;

        return (dotA > 0) && (dotA <= lenA)
            && (dotB > 0) && (dotB <= lenB);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._texture = null;
        this._spriteData = null;
        this._positionData = null;
        this._texCoordData = null;
    }
}
