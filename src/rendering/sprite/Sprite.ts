import Container from '../Container';
import Rectangle from '../../math/Rectangle';
import Vector from '../../math/Vector';
import Interval from '../../math/Interval';
import { Flags } from '../../const/core';
import Texture from "../texture/Texture";
import RenderTexture from "../texture/RenderTexture";
import RenderManager from "../RenderManager";
import SpriteRenderer from "./SpriteRenderer";
import { RendererType } from "../IRenderer";

export default class Sprite extends Container {

    private _texture: Texture | RenderTexture | null = null;
    private _textureFrame: Rectangle = new Rectangle();
    private _vertices: Float32Array = new Float32Array(8);
    private _texCoords: Uint32Array = new Uint32Array(4);

    constructor(texture: Texture | RenderTexture | null) {
        super();

        if (texture !== null) {
            this.setTexture(texture);
        }
    }

    get texture(): Texture | RenderTexture | null {
        return this._texture;
    }

    set texture(texture: Texture | RenderTexture | null) {
        this.setTexture(texture);
    }

    get textureFrame(): Rectangle {
        return this._textureFrame;
    }

    set textureFrame(frame: Rectangle) {
        this.setTextureFrame(frame);
    }

    get width(): number {
        return Math.abs(this.scale.x) * this._textureFrame.width;
    }

    set width(value: number) {
        this.scale.x = (value / this._textureFrame.width);
    }

    get height(): number {
        return Math.abs(this.scale.y) * this._textureFrame.height;
    }

    set height(value: number) {
        this.scale.y = (value / this._textureFrame.height);
    }

    // todo cache this
    get vertices(): Float32Array {
        const { left, top, right, bottom } = this.getLocalBounds();
        const { a, b, x, c, d, y } = this.getGlobalTransform();

        this._vertices[0] = (left * a) + (top * b) + x;
        this._vertices[1] = (left * c) + (top * d) + y;

        this._vertices[2] = (right * a) + (top * b) + x;
        this._vertices[3] = (right * c) + (top * d) + y;

        this._vertices[4] = (right * a) + (bottom * b) + x;
        this._vertices[5] = (right * c) + (bottom * d) + y;

        this._vertices[6] = (left * a) + (bottom * b) + x;
        this._vertices[7] = (left * c) + (bottom * d) + y;

        return this._vertices;
    }

    get texCoords(): Uint32Array {
        if (this._texture === null) {
            throw new Error('texCoords can only be calculated when the sprite has a texture')
        }

        if (this.flags.has(Flags.TEXTURE_COORDS)) {
            const { width, height } = this._texture;
            const  { left, top, right, bottom } = this._textureFrame;
            const  minX = ((left / width) * 65535 & 65535);
            const  minY = ((top / height) * 65535 & 65535) << 16;
            const  maxX = ((right / width) * 65535 & 65535);
            const  maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
                this._texCoords[0] = (maxY | minX);
                this._texCoords[1] = (maxY | maxX);
                this._texCoords[2] = (minY | maxX);
                this._texCoords[3] = (minY | minX);
            } else {
                this._texCoords[0] = (minY | minX);
                this._texCoords[1] = (minY | maxX);
                this._texCoords[2] = (maxY | maxX);
                this._texCoords[3] = (maxY | minX);
            }

            this.flags.remove(Flags.TEXTURE_COORDS);
        }

        return this._texCoords;
    }

    setTexture(texture: Texture | RenderTexture | null): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.updateTexture();
        }

        return this;
    }

    updateTexture(): this {
        if (this._texture) {
            this._texture.updateSource();
            this.resetTextureFrame();
        }

        return this;
    }

    setTextureFrame(frame: Rectangle, resetSize: boolean = true): this {
        const width = this.width;
        const height = this.height;

        this._textureFrame.copy(frame);
        this.flags.add(Flags.TEXTURE_COORDS);
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

    resetTextureFrame(): this {
        if (!this._texture) {
            throw new Error('Cannot reset texture frame when no texture was set');
        }

        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    render(renderManager: RenderManager): this {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer(RendererType.Sprite) as SpriteRenderer;

            renderManager.setRenderer(renderer);
            renderer.render(this);

            for (const child of this.children) {
                child.render(renderManager);
            }
        }

        return this;
    }

    // todo cache this
    getNormals(): Array<Vector> {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = this.vertices;

        return [
            new Vector(x2 - x1, y2 - y1).rperp().normalize(),
            new Vector(x3 - x2, y3 - y2).rperp().normalize(),
            new Vector(x4 - x3, y4 - y3).rperp().normalize(),
            new Vector(x1 - x4, y1 - y4).rperp().normalize(),
        ];
    }

    project(axis: Vector, result: Interval = new Interval()): Interval {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = this.vertices;
        const proj1 = axis.dot(x1, y1);
        const proj2 = axis.dot(x2, y2);
        const proj3 = axis.dot(x3, y3);
        const proj4 = axis.dot(x4, y4);

        return result.set(
            Math.min(proj1, proj2, proj3, proj4),
            Math.max(proj1, proj2, proj3, proj4)
        );
    }

    contains(x: number, y: number) {
        if ((this.rotation % 90 === 0)) {
            return this.getBounds().contains(x, y);
        }

        const [x1, y1, x2, y2, x3, y3] = this.vertices,
            temp = Vector.Temp,
            vecA = temp.set(x2 - x1, y2 - y1),
            dotA = vecA.dot(x - x1, y - y1),
            lenA = vecA.lengthSq,
            vecB = temp.set(x3 - x2, y3 - y2),
            dotB = vecB.dot(x - x2, y - y2),
            lenB = vecB.lengthSq;

        return (dotA > 0) && (dotA <= lenA)
            && (dotB > 0) && (dotB <= lenB);
    }

    destroy() {
        super.destroy();

        this._textureFrame.destroy();
        this._texture = null;
    }
}
