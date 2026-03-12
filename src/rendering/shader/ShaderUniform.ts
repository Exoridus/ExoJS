import type { TypedArray } from 'types/types';

export class ShaderUniform {

    public readonly index: number;
    public readonly type: number;
    public readonly size: number;
    public readonly name: string;

    private readonly _value: TypedArray;
    private _dirty = true;

    public constructor(index: number, type: number, size: number, name: string, data: TypedArray) {
        this.name = name.replace(/\[.*?]/, '');
        this.index = index;
        this.type = type;
        this.size = size;
        this._value = data;
    }

    public get propName(): string {
        return this.name.substr(this.name.lastIndexOf('.') + 1);
    }

    public get value(): TypedArray {
        return this._value;
    }

    public get dirty(): boolean {
        return this._dirty;
    }

    public setValue(value: TypedArray): this {
        this._value.set(value);
        this._dirty = true;

        return this;
    }

    public markClean(): void {
        this._dirty = false;
    }

    public destroy(): void {
        // no-op — value container only
    }
}
