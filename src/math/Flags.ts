export default class Flags {

    private _value = 0;

    constructor(...flags: Array<number>) {
        if (flags.length) {
            this.add(...flags);
        }
    }

    public get value(): number {
        return this._value;
    }

    public add(...flags: Array<number>): this {
        for (const flag of flags) {
            this._value |= flag;
        }

        return this;
    }

    public remove(...flags: Array<number>): this {
        for (const flag of flags) {
            this._value &= ~flag;
        }

        return this;
    }

    public has(...flags: Array<number>): boolean {
        return flags.every((flag) => ((this._value & flag) !== 0));
    }

    public destroy() {

    }
}
