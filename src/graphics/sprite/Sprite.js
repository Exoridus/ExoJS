import Container from '../Container';
import Rectangle from '../../math/Rectangle';
import Vector from '../../math/Vector';
import Color from '../../core/Color';
import { BLEND_MODE } from '../../const';
import Interval from '../../math/Interval';

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
         * @private
         * @member {Color}
         */
        this._tint = Color.White.clone();

        /**
         * @private
         * @member {Number}
         */
        this._blendMode = BLEND_MODE.NORMAL;

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
     * @member {Color}
     */
    get tint() {
        return this._tint;
    }

    set tint(tint) {
        this.setTint(tint);
    }

    /**
     * @public
     * @member {Number}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
        this.setBlendMode(blendMode);
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get positionData() {
        const vertices = this.getVertices(),
            positionData = this._positionData;

        positionData[0] = vertices[0].x;
        positionData[1] = vertices[0].y;

        positionData[2] = vertices[1].x;
        positionData[3] = vertices[1].y;

        positionData[4] = vertices[3].x;
        positionData[5] = vertices[3].y;

        positionData[6] = vertices[2].x;
        positionData[7] = vertices[2].y;

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
                { width, height, flipY } = this._texture,
                minX = ((left / width) * 65535 & 65535),
                minY = ((top / height) * 65535 & 65535) << 16,
                maxX = ((right / width) * 65535 & 65535),
                maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (flipY) {
                this._texCoordData[0] = (maxY | minX);
                this._texCoordData[1] = (maxY | maxX);
                this._texCoordData[2] = (minY | minX);
                this._texCoordData[3] = (minY | maxX);
            } else {
                this._texCoordData[0] = (minY | minX);
                this._texCoordData[1] = (minY | maxX);
                this._texCoordData[2] = (maxY | minX);
                this._texCoordData[3] = (maxY | maxX);
            }

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
     * @public
     * @chainable
     * @returns {Sprite}
     */
    resetTextureFrame() {
        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {Drawable}
     */
    setTint(color) {
        this._tint.copy(color);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} blendMode
     * @returns {Drawable}
     */
    setBlendMode(blendMode) {
        this._blendMode = blendMode;

        return this;
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && renderManager.insideViewport(this)) {
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
     * todo - cache this
     *
     * @public
     * @returns {Vector[]}
     */
    getVertices() {
        const bounds = this.getLocalBounds(),
            transform = this.getGlobalTransform();

        return [
            new Vector(bounds.left, bounds.top).transform(transform),
            new Vector(bounds.right, bounds.top).transform(transform),
            new Vector(bounds.right, bounds.bottom).transform(transform),
            new Vector(bounds.left, bounds.bottom).transform(transform),
        ];
    }

    /**
     * todo - cache this
     *
     * @public
     * @returns {Vector[]}
     */
    getNormals() {
        const vertices = this.getVertices(),
            len = vertices.length,
            normals = [];

        for (let i = 0; i < len; i++) {
            const point = vertices[i],
                nextPoint = vertices[(i + 1) % len];

            normals.push(
                nextPoint.clone()
                    .subtract(point.x, point.y)
                    .perp()
                    .normalize()
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
        const vertices = this.getVertices(),
            len = vertices.length,
            { x, y } = vertices[0];

        let min = axis.dot(x, y),
            max = min;

        for (let i = 1; i < len; i++) {
            const { x, y } = vertices[i],
                projection = axis.dot(x, y);

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

        const temp = Vector.Temp,
            vertices = this.getVertices(),
            { x: x1, y: y1 } = vertices[0],
            { x: x2, y: y2 } = vertices[1],
            { x: x3, y: y3 } = vertices[2],
            vecA = temp.set(x2 - x1, y2 - y1),
            dotA = vecA.dot(x - x1, y - y1),
            lenA = vecA.dot(vecA.x, vecA.y),
            vecB = temp.set(x3 - x2, y3 - y2),
            dotB = vecB.dot(x - x2, y - y2),
            lenB = vecB.dot(vecB.x, vecB.y);

        return (dotA > 0)
            && (dotA <= lenA)
            && (dotB > 0)
            && (dotB <= lenB);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._tint.destroy();
        this._tint = null;

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._texture = null;
        this._blendMode = null;
        this._vertexData = null;
        this._positionData = null;
        this._texCoordData = null;
        this._updateTexCoords = null;
    }
}
