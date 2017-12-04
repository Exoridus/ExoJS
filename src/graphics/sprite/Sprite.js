import Container from '../Container';
import Rectangle from '../../math/Rectangle';
import Vector from '../../math/Vector';
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
        this._spriteData = new ArrayBuffer(48);

        /**
         * @private
         * @type {Float32Array}
         */
        this._vertexData = new Float32Array(this._spriteData, 0, 8);

        /**
         * @private
         * @type {Uint32Array}
         */
        this._texCoordData = new Uint32Array(this._spriteData, 32, 4);

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
     * @readonly
     * @member {Float32Array}
     */
    get vertexData() {
        const { left, top, right, bottom } = this.getLocalBounds(),
            { a, b, c, d, x, y } = this.getGlobalTransform();

        this._vertexData[0] = (left * a) + (top * b) + x;
        this._vertexData[1] = (left * c) + (top * d) + y;

        this._vertexData[2] = (right * a) + (top * b) + x;
        this._vertexData[3] = (right * c) + (top * d) + y;

        this._vertexData[4] = (left * a) + (bottom * b) + x;
        this._vertexData[5] = (left * c) + (bottom * d) + y;

        this._vertexData[6] = (right * a) + (bottom * b) + x;
        this._vertexData[7] = (right * c) + (bottom * d) + y;

        return this._vertexData;
    }

    /**
     * @public
     * @readonly
     * @member {Uint32Array}
     */
    get texCoordData() {
        if (this._updateTexCoords) {
            const { width, height } = this._texture,
                { left, top, right, bottom } = this._textureFrame,
                minX = ((left / width) * 65535 & 65535),
                minY = ((top / height) * 65535 & 65535) << 16,
                maxX = ((right / width) * 65535 & 65535),
                maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
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
        const vertexData = this.vertexData;

        return [
            new Vector(vertexData[0], vertexData[1]),
            new Vector(vertexData[2], vertexData[3]),
            new Vector(vertexData[6], vertexData[7]),
            new Vector(vertexData[4], vertexData[5]),
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

        const vertices = this.getVertices(),
            { x: x1, y: y1 } = vertices[0],
            { x: x2, y: y2 } = vertices[1],
            { x: x3, y: y3 } = vertices[2],
            temp = Vector.Temp,
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

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._texture = null;
        this._spriteData = null;
        this._vertexData = null;
        this._texCoordData = null;
        this._updateTexCoords = null;
    }
}
