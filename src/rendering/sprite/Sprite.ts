import { Drawable } from '@/rendering/Drawable';
import { Rectangle } from '@/math/Rectangle';
import { Vector } from '@/math/Vector';
import { Interval } from '@/math/Interval';
import type { Texture } from '@/rendering/texture/Texture';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import { RenderNode } from '@/rendering/RenderNode';

export enum SpriteFlags {
    None = 0x00,
    Translation = 0x01,
    Rotation = 0x02,
    Scaling = 0x04,
    Origin = 0x08,
    Transform = 0x0F,
    TransformInverse = 0x10,
    BoundingBox = 0x20,
    TextureCoords = 0x40,
    VertexTint = 0x80,
    Vertices = 0x400,
    Normals  = 0x800,
}

export class Sprite extends Drawable {

    private _texture: Texture | RenderTexture | null = null;
    private _textureFrame: Rectangle = new Rectangle();
    private _vertices: Float32Array = new Float32Array(8);
    private _texCoords: Uint32Array = new Uint32Array(4);
    private readonly _normals: [Vector, Vector, Vector, Vector] = [
        new Vector(), new Vector(), new Vector(), new Vector(),
    ];

    public constructor(texture: Texture | RenderTexture | null) {
        super();

        // Mark vertices and normals dirty from the start.
        this.flags.push(SpriteFlags.Vertices | SpriteFlags.Normals);

        if (texture !== null) {
            this.setTexture(texture);
        }
    }

    public get texture(): Texture | RenderTexture | null {
        return this._texture;
    }

    public set texture(texture: Texture | RenderTexture | null) {
        this.setTexture(texture);
    }

    public get textureFrame(): Rectangle {
        return this._textureFrame;
    }

    public set textureFrame(frame: Rectangle) {
        this.setTextureFrame(frame);
    }

    public get width(): number {
        return Math.abs(this.scale.x) * this._textureFrame.width;
    }

    public set width(value: number) {
        this.scale.x = (value / this._textureFrame.width);
    }

    public get height(): number {
        return Math.abs(this.scale.y) * this._textureFrame.height;
    }

    public set height(value: number) {
        this.scale.y = (value / this._textureFrame.height);
    }

    public get vertices(): Float32Array {
        if (this.flags.has(SpriteFlags.Vertices)) {
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

            this.flags.remove(SpriteFlags.Vertices);
        }

        return this._vertices;
    }

    public get texCoords(): Uint32Array {
        if (this._texture === null) {
            throw new Error('texCoords can only be calculated when the sprite has a texture')
        }

        if (this.flags.pop(SpriteFlags.TextureCoords)) {
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
        }

        return this._texCoords;
    }

    public setTexture(texture: Texture | RenderTexture | null): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.updateTexture();
            this.invalidateCache();
        }

        return this;
    }

    public updateTexture(): this {
        if (this._texture) {
            this._texture.updateSource();
            this.resetTextureFrame();
            this.invalidateCache();
        }

        return this;
    }

    public setTextureFrame(frame: Rectangle, resetSize = true): this {
        const width = this.width;
        const height = this.height;

        this._textureFrame.copy(frame);
        this.flags.push(SpriteFlags.TextureCoords);
        this.localBounds.set(0, 0, frame.width, frame.height);
        this._invalidateBoundsCascade();

        if (resetSize) {
            this.width = frame.width;
            this.height = frame.height;
        } else {
            this.width = width;
            this.height = height;
        }

        this.invalidateCache();

        return this;
    }

    public resetTextureFrame(): this {
        if (!this._texture) {
            throw new Error('Cannot reset texture frame when no texture was set');
        }

        return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
    }

    public override getNormals(): Array<Vector> {
        if (this.flags.has(SpriteFlags.Normals)) {
            const [x1, y1, x2, y2, x3, y3, x4, y4] = this.vertices;

            this._normals[0].set(x2 - x1, y2 - y1).rperp().normalize();
            this._normals[1].set(x3 - x2, y3 - y2).rperp().normalize();
            this._normals[2].set(x4 - x3, y4 - y3).rperp().normalize();
            this._normals[3].set(x1 - x4, y1 - y4).rperp().normalize();

            this.flags.remove(SpriteFlags.Normals);
        }

        return this._normals;
    }

    public override project(axis: Vector, result: Interval = new Interval()): Interval {
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

    public override contains(x: number, y: number): boolean {
        if ((this.rotation % 90 === 0)) {
            return this.getBounds().contains(x, y);
        }

        const [x1, y1, x2, y2, x3, y3] = this.vertices,
            temp = Vector.temp,
            vecA = temp.set(x2 - x1, y2 - y1),
            dotA = vecA.dot(x - x1, y - y1),
            lenA = vecA.lengthSq,
            vecB = temp.set(x3 - x2, y3 - y2),
            dotB = vecB.dot(x - x2, y - y2),
            lenB = vecB.lengthSq;

        return (dotA > 0) && (dotA <= lenA)
            && (dotB > 0) && (dotB <= lenB);
    }

    public override _invalidateSubtreeTransform(): void {
        super._invalidateSubtreeTransform();
        this.flags.push(SpriteFlags.Vertices | SpriteFlags.Normals);
    }

    public override _invalidateBoundsCascade(): void {
        super._invalidateBoundsCascade();
        this.flags.push(SpriteFlags.Vertices | SpriteFlags.Normals);
    }

    public override destroy(): void {
        super.destroy();

        for (const normal of this._normals) {
            normal.destroy();
        }

        this._textureFrame.destroy();
        this._texture = null;
    }
}

RenderNode.setInternalSpriteFactory(() => new Sprite(null));
