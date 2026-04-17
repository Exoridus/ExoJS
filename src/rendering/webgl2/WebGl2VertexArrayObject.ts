import { RenderingPrimitives, ShaderPrimitives } from 'rendering/types';
import type { ShaderAttribute } from '../shader/ShaderAttribute';
import type { WebGl2RenderBuffer } from './WebGl2RenderBuffer';

interface VaoAttribute {
    readonly buffer: WebGl2RenderBuffer;
    readonly location: number;
    readonly size: number;
    readonly type: number;
    readonly normalized: boolean;
    readonly stride: number;
    readonly start: number;
}

export interface WebGl2VertexArrayObjectRuntime {
    bind(vao: WebGl2VertexArrayObject): void;
    unbind(vao: WebGl2VertexArrayObject): void;
    draw(vao: WebGl2VertexArrayObject, size: number, start: number, type: RenderingPrimitives): void;
    destroy(vao: WebGl2VertexArrayObject): void;
}

export class WebGl2VertexArrayObject {

    private readonly _attributes: Array<VaoAttribute> = [];
    private _indexBuffer: WebGl2RenderBuffer | null = null;
    private _drawMode: RenderingPrimitives;
    private _runtime: WebGl2VertexArrayObjectRuntime | null = null;
    private _version = 0;

    public constructor(drawMode: RenderingPrimitives = RenderingPrimitives.Triangles) {
        this._drawMode = drawMode;
    }

    public get attributes(): Array<VaoAttribute> {
        return this._attributes;
    }

    public get indexBuffer(): WebGl2RenderBuffer | null {
        return this._indexBuffer;
    }

    public get drawMode(): RenderingPrimitives {
        return this._drawMode;
    }

    public get version(): number {
        return this._version;
    }

    public connect(runtime: WebGl2VertexArrayObjectRuntime): this {
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

    public addAttribute(buffer: WebGl2RenderBuffer, attribute: ShaderAttribute, type: number = ShaderPrimitives.Float, normalized = false, stride = 0, start = 0): this {
        const { location, size } = attribute;

        this._attributes.push({ buffer, location, size, type, normalized, stride, start });
        this._version++;

        return this;
    }

    public addIndex(buffer: WebGl2RenderBuffer): this {
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
