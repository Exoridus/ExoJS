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
         * @private
         * @type {Float32Array}
         */
        this._vertexPos = new Float32Array(8);

        /**
         * @private
         * @type {Uint32Array}
         */
        this._vertexUvs = new Uint32Array(4);

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
    get vertexPos() {
        const { left, top, right, bottom } = this.getLocalBounds(),
            { a, b, x, c, d, y } = this.getGlobalTransform();

        this._vertexPos[0] = (left * a) + (top * b) + x;
        this._vertexPos[1] = (left * c) + (top * d) + y;

        this._vertexPos[2] = (right * a) + (top * b) + x;
        this._vertexPos[3] = (right * c) + (top * d) + y;

        this._vertexPos[4] = (right * a) + (bottom * b) + x;
        this._vertexPos[5] = (right * c) + (bottom * d) + y;

        this._vertexPos[6] = (left * a) + (bottom * b) + x;
        this._vertexPos[7] = (left * c) + (bottom * d) + y;

        return this._vertexPos;
    }

    /**
     * @public
     * @readonly
     * @member {Uint32Array}
     */
    get vertexUvs() {
        if (this.flags.has(FLAGS.TEXTURE_COORDS)) {
            const { width, height } = this._texture,
                { left, top, right, bottom } = this._textureFrame,
                minX = ((left / width) * 65535 & 65535),
                minY = ((top / height) * 65535 & 65535) << 16,
                maxX = ((right / width) * 65535 & 65535),
                maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
                this._vertexUvs[0] = (maxY | minX);
                this._vertexUvs[1] = (maxY | maxX);
                this._vertexUvs[2] = (minY | maxX);
                this._vertexUvs[3] = (minY | minX);
            } else {
                this._vertexUvs[0] = (minY | minX);
                this._vertexUvs[1] = (minY | maxX);
                this._vertexUvs[2] = (maxY | maxX);
                this._vertexUvs[3] = (maxY | minX);
            }

            this.flags.remove(FLAGS.TEXTURE_COORDS);
        }

        return this._vertexUvs;
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return Math.abs(this.scale.x) * this._textureFrame.width;
    }

    set width(value) {
        this.scale.x = (value / this._textureFrame.width);
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this.scale.y) * this._textureFrame.height;
    }

    set height(value) {
        this.scale.y = (value / this._textureFrame.height);
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
     * todo - cache this
     *
     * @public
     * @returns {Vector[]}
     */
    getNormals() {
        const normals = [],
            positions = this.vertexPos,
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
        const positions = this.vertexPos,
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

        const [x1, y1, x2, y2, x3, y3] = this.vertexPos,
            temp = Vector.Temp,
            vecA = temp.set(x2 - x1, y2 - y1),
            dotA = vecA.dot(x - x1, y - y1),
            lenA = vecA.len2,
            vecB = temp.set(x3 - x2, y3 - y2),
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
        this._vertexPos = null;
        this._vertexUvs = null;
    }
}
