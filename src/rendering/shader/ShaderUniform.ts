import { PrimitiveUploadFunction, primitiveUploadFunctions } from 'types/rendering';
import type { TypedArray } from 'types/types';

export class ShaderUniform {

    public readonly index: number;
    public readonly type: number;
    public readonly size: number;
    public readonly name: string;
    public readonly location: WebGLUniformLocation | null;

    private readonly _context: WebGL2RenderingContext | null;
    private readonly _program: WebGLProgram | null;
    private readonly _uploadFn: PrimitiveUploadFunction | null;
    private readonly _value: TypedArray;

    public constructor(gl: WebGL2RenderingContext, program: WebGLProgram, index: number, type: number, size: number, name: string, data: TypedArray) {
        this._context = gl;
        this._program = program;
        this.name = name.replace(/\[.*?]/, '');
        this.location = gl.getUniformLocation(program, this.name);
        this.index = index;
        this.type = type;
        this.size = size;
        this._value = data;
        this._uploadFn = primitiveUploadFunctions[type];
    }

    public get propName(): string {
        return this.name.substr(this.name.lastIndexOf('.') + 1);
    }

    public get value(): ArrayBufferView {
        return this._value;
    }

    public setValue(value: TypedArray): this {
        this._value.set(value);
        this.upload();

        return this;
    }

    public upload(): this {
        if (this.location) {
            this._uploadFn!(this._context!, this.location, this._value);
        }

        return this;
    }

    public destroy(): void {
        // todo - check if destroy is needed
    }
}
