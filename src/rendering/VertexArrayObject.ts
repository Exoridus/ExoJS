import { RenderingPrimitives, ShaderPrimitives } from 'types/rendering';
import type { ShaderAttribute } from './shader/ShaderAttribute';
import type { RenderBuffer } from './RenderBuffer';

interface IVaoAttribute {
    readonly buffer: RenderBuffer;
    readonly location: number;
    readonly size: number;
    readonly type: number;
    readonly normalized: boolean;
    readonly stride: number;
    readonly start: number;
}

export interface IVertexArrayObjectRuntime {
    bind(vao: VertexArrayObject): void;
    unbind(vao: VertexArrayObject): void;
    draw(vao: VertexArrayObject, size: number, start: number, type: RenderingPrimitives): void;
    destroy(vao: VertexArrayObject): void;
}

export class VertexArrayObject {

    private readonly _attributes: Array<IVaoAttribute> = [];
    private _indexBuffer: RenderBuffer | null = null;
    private _drawMode: RenderingPrimitives;
    private _runtime: IVertexArrayObjectRuntime | null = null;
    private _version = 0;

    public constructor(drawMode: RenderingPrimitives = RenderingPrimitives.TRIANGLES) {
        this._drawMode = drawMode;
    }

    public get attributes(): Array<IVaoAttribute> {
        return this._attributes;
    }

    public get indexBuffer(): RenderBuffer | null {
        return this._indexBuffer;
    }

    public get drawMode(): RenderingPrimitives {
        return this._drawMode;
    }

    public get version(): number {
        return this._version;
    }

    public connect(runtime: IVertexArrayObjectRuntime): this {
        this._runtime = runtime;

        return this;
    }

    public disconnect(): this {
        this._runtime = null;

        return this;
    }

    public bind(): this {
        this._runtime?.bind(this);

        return this;
    }

    public unbind(): this {
        this._runtime?.unbind(this);

        return this;
    }

    public addAttribute(buffer: RenderBuffer, attribute: ShaderAttribute, type: number = ShaderPrimitives.FLOAT, normalized = false, stride = 0, start = 0): this {
        const { location, size } = attribute;

        this._attributes.push({ buffer, location, size, type, normalized, stride, start });
        this._version++;

        return this;
    }

    public addIndex(buffer: RenderBuffer): this {
        this._indexBuffer = buffer;
        this._version++;

        return this;
    }

    public clear(): this {
        this._attributes.length = 0;
        this._indexBuffer = null;
        this._version++;

        return this;
    }

    public draw(size: number, start: number, type: RenderingPrimitives = this._drawMode): this {
        this._runtime?.draw(this, size, start, type);

        return this;
    }

    public destroy(): void {
        this._runtime?.destroy(this);
        this._runtime = null;
        this._indexBuffer = null;
    }
}
