import { emptyArrayBuffer } from 'core/utils';
import type { BufferTypes, BufferUsage } from 'rendering/types';
import type { TypedArray } from 'core/types';

type DataContainer = ArrayBuffer | SharedArrayBuffer | ArrayBufferView | TypedArray;

export interface WebGl2RenderBufferRuntime {
    bind(buffer: WebGl2RenderBuffer): void;
    upload(buffer: WebGl2RenderBuffer, offset: number): void;
    destroy(buffer: WebGl2RenderBuffer): void;
}

export class WebGl2RenderBuffer {

    private readonly _type: number;
    private readonly _usage: BufferUsage;
    private _runtime: WebGl2RenderBufferRuntime | null = null;
    private _data: DataContainer = emptyArrayBuffer;
    private _version = 0;

    public constructor(type: BufferTypes, data: DataContainer, usage: BufferUsage) {

        this._type = type;
        this._usage = usage;

        if (data) {
            this.upload(data);
        }
    }

    public get type(): number {
        return this._type;
    }

    public get usage(): BufferUsage {
        return this._usage;
    }

    public get data(): DataContainer {
        return this._data;
    }

    public get version(): number {
        return this._version;
    }

    public connect(runtime: WebGl2RenderBufferRuntime): this {
        this._runtime = runtime;

        if (this._data.byteLength > 0) {
            runtime.upload(this, 0);
        }

        return this;
    }

    public disconnect(): this {
        this._runtime = null;

        return this;
    }

    public upload(data: DataContainer, offset = 0): void {
        this._data = data;
        this._version++;

        this._runtime?.upload(this, offset);
    }

    public bind(): void {
        this._runtime?.bind(this);
    }

    public destroy(): void {
        this._runtime?.destroy(this);
        this._runtime = null;
    }
}
