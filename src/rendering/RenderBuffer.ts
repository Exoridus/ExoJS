import { emptyArrayBuffer } from '../const/core';
import { BufferTypes, BufferUsage } from "../const/rendering";
import { TypedArray } from "../const/types";

type DataContainer = ArrayBuffer | SharedArrayBuffer | ArrayBufferView | TypedArray;

export class RenderBuffer {

    private readonly _context: WebGL2RenderingContext;
    private readonly _buffer: WebGLBuffer | null;
    private readonly _type: number;
    private readonly _usage: BufferUsage;
    private _data: DataContainer = emptyArrayBuffer;

    constructor(gl: WebGL2RenderingContext, type: BufferTypes, data: DataContainer, usage: BufferUsage) {

        this._context = gl;
        this._buffer = gl.createBuffer();
        this._type = type;
        this._usage = usage;

        if (data) {
            this.upload(data);
        }
    }

    public upload(data: DataContainer, offset = 0): void {
        this.bind();

        if (this._data.byteLength >= data.byteLength) {
            this._context.bufferSubData(this._type, offset, data);
        } else {
            this._context.bufferData(this._type, data, this._usage);
        }

        this._data = data;
    }

    public bind(): void {
        this._context.bindBuffer(this._type, this._buffer);
    }

    public destroy(): void {
        this._context.deleteBuffer(this._buffer);
    }
}
