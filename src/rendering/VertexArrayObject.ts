import { RenderingPrimitives, ShaderPrimitives } from 'types/rendering';
import type { ShaderAttribute } from './shader/ShaderAttribute';
import type { RenderBuffer } from './RenderBuffer';

interface IVaoAttribute {
    buffer: RenderBuffer;
    location: number;
    size: number;
    type: number;
    normalized: boolean;
    stride: number;
    start: number;
}

export class VertexArrayObject {

    private _context: WebGL2RenderingContext;
    private _vao: WebGLVertexArrayObject | null;
    private _attributes: Array<IVaoAttribute> = [];
    private _indexBuffer: RenderBuffer | null = null;
    private _drawMode: RenderingPrimitives;
    private _dirty = false;

    public constructor(gl: WebGL2RenderingContext, drawMode: RenderingPrimitives = RenderingPrimitives.TRIANGLES) {
        this._context = gl;
        this._vao = gl.createVertexArray();
        this._drawMode = drawMode;
    }

    public bind(): this {
        const gl = this._context;

        this._context.bindVertexArray(this._vao);

        if (this._dirty) {
            let lastBuffer = null;

            for (const attribute of this._attributes) {
                if (lastBuffer !== attribute.buffer) {
                    attribute.buffer.bind();
                    lastBuffer = attribute.buffer;
                }

                gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
                gl.enableVertexAttribArray(attribute.location);
            }

            this._dirty = false;
        }

        if (this._indexBuffer) {
            this._indexBuffer.bind();
        }

        return this;
    }

    public unbind(): this {
        this._context.bindVertexArray(null);

        return this;
    }

    public addAttribute(buffer: RenderBuffer, attribute: ShaderAttribute, type = ShaderPrimitives.FLOAT, normalized = false, stride = 0, start = 0): this {
        const { location, size } = attribute;

        this._attributes.push({ buffer, location, size, type, normalized, stride, start });
        this._dirty = true;

        return this;
    }

    public addIndex(buffer: RenderBuffer): this {
        this._indexBuffer = buffer;
        this._dirty = true;

        return this;
    }

    public clear(): this {
        this.unbind();

        this._attributes.length = 0;
        this._indexBuffer = null;

        return this;
    }

    public draw(size: number, start: number, type: RenderingPrimitives = this._drawMode): this {
        const gl = this._context;

        if (this._indexBuffer) {
            gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
        } else {
            gl.drawArrays(type, start, size);
        }

        return this;
    }

    public destroy(): void {
        this._context.deleteVertexArray(this._vao);
        this._indexBuffer = null;
        this._vao = null;
    }
}
