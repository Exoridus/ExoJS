import { PrimitiveUploadFunction, PrimitiveUploadFunctions } from '../../const/rendering';
import { TypedArray } from "../../const/types";

export default class ShaderUniform {

    public readonly index: number;
    public readonly type: number;
    public readonly size: number;
    public readonly name: string;
    public readonly location: WebGLUniformLocation | null;

    private readonly _context: WebGL2RenderingContext;
    private readonly _program: WebGLProgram;
    private readonly _uploadFn: PrimitiveUploadFunction;
    private readonly _value: TypedArray;

    constructor(gl: WebGL2RenderingContext, program: WebGLProgram, index: number, type: number, size: number, name: string, data: TypedArray) {
        this._context = gl;
        this._program = program;
        this.name = name.replace(/\[.*?]/, '');
        this.location = gl.getUniformLocation(program, this.name);
        this.index = index;
        this.type = type;
        this.size = size;
        this._value = data;
        this._uploadFn = PrimitiveUploadFunctions[type];
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
            this._uploadFn(this._context, this.location, this._value);
        }

        return this;
    }

    public destroy(): void {

    }
}
