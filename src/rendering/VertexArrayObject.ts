import { RenderingPrimitives, ShaderPrimitives } from '../const/rendering';
import { ShaderAttribute } from './shader/ShaderAttribute';
import { RenderBuffer } from './RenderBuffer';

interface VAOAttribute {
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
    private _attributes: Array<VAOAttribute> = [];
    private _indexBuffer: RenderBuffer | null = null;
    private _drawMode: RenderingPrimitives;
    private _dirty = false;

    constructor(gl: WebGL2RenderingContext, drawMode: RenderingPrimitives = RenderingPrimitives.TRIANGLES) {
        this._context = gl;
        this._vao = gl.createVertexArray();
        this._drawMode = drawMode;
    }

    bind() {
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

    unbind() {
        this._context.bindVertexArray(null);

        return this;
    }

    addAttribute(buffer: RenderBuffer, attribute: ShaderAttribute, type = ShaderPrimitives.FLOAT, normalized = false, stride = 0, start = 0) {
        const { location, size } = attribute;

        this._attributes.push({ buffer, location, size, type, normalized, stride, start });
        this._dirty = true;

        return this;
    }

    addIndex(buffer: RenderBuffer) {
        this._indexBuffer = buffer;
        this._dirty = true;

        return this;
    }

    clear() {
        this.unbind();

        this._attributes.length = 0;
        this._indexBuffer = null;

        return this;
    }

    draw(size: number, start: number, type: RenderingPrimitives = this._drawMode) {
        const gl = this._context;

        if (this._indexBuffer) {
            gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
        } else {
            gl.drawArrays(type, start, size);
        }

        return this;
    }

    destroy() {
        this._context.deleteVertexArray(this._vao);
        this._indexBuffer = null;
        this._vao = null;
    }
}
