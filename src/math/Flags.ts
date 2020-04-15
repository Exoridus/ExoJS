import { TypedEnum } from "../const/types";

export class Flags<T extends TypedEnum<T, number>> {

    private _value = 0;

    public get value(): number {
        return this._value;
    }

    constructor(...flags: Array<number>) {
        if (flags.length) {
            this.add(...flags);
        }
    }

    public add<V extends number = T[keyof T]>(...flags: Array<V>): this {
        for (const flag of flags) {
            this._value |= flag;
        }

        return this;
    }

    public remove<V extends number = T[keyof T]>(...flags: Array<V>): this {
        for (const flag of flags) {
            this._value &= ~flag;
        }

        return this;
    }

    public has<V extends number = T[keyof T]>(...flags: Array<V>): boolean {
        return flags.every(flag => (this._value & flag) !== 0);
    }

    public clear(): this {
        this._value = 0;

        return this;
    }

    public destroy() {
        // todo - check if destroy is needed
    }
}
