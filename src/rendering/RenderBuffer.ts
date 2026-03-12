import { emptyArrayBuffer } from 'utils/core';
import type { BufferTypes, BufferUsage } from 'types/rendering';
import type { TypedArray } from 'types/types';

type DataContainer = ArrayBuffer | SharedArrayBuffer | ArrayBufferView | TypedArray;

export interface RenderBufferRuntime {
    bind(buffer: RenderBuffer): void;
    upload(buffer: RenderBuffer, offset: number): void;
    destroy(buffer: RenderBuffer): void;
}

export class RenderBuffer {

    private readonly _type: number;
    private readonly _usage: BufferUsage;
    private _runtime: RenderBufferRuntime | null = null;
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

    public connect(runtime: RenderBufferRuntime): this {
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
