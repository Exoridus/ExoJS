const limit = (2 ** 32) - 1;

export class Random {

    private _state: Uint32Array = new Uint32Array(624);
    private _iteration = 0;
    private _seed = 0;
    private _value = 0;

    constructor(seed: number = Date.now()) {
        this.setSeed(seed);
        this._twist();
    }

    public get seed(): number {
        return this._seed;
    }

    public get value(): number {
        return this._value;
    }

    public get iteration(): number {
        return this._iteration;
    }

    public setSeed(seed: number): this {
        this._seed = seed;
        this.reset();

        return this;
    }

    public reset(): this {
        this._state[0] = this._seed;

        for (let i = 1; i < 624; i++) {
            const s = this._state[i - 1] ^ (this._state[i - 1] >>> 30);

            this._state[i] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + i;
            this._state[i] |= 0;
        }

        this._iteration = 0;

        return this;
    }

    public next(min = 0, max = 1): number {
        if (this._iteration >= 624) {
            this._twist();
        }

        this._value = this._state[this._iteration++];
        this._value ^= (this._value >>> 11);
        this._value ^= (this._value << 7) & 0x9d2c5680;
        this._value ^= (this._value << 15) & 0xefc60000;
        this._value ^= (this._value >>> 18);
        this._value = (((this._value >>> 0) / limit) * (max - min)) + min;

        return this._value;
    }

    public destroy() {
        // todo - check if destroy is needed
    }

    private _twist() {
        const state = this._state;

        // first 624-397=227 words
        for (let i = 0; i < 227; i++) {
            const bits = (state[i] & 0x80000000) | (state[i + 1] & 0x7fffffff);

            state[i] = state[i + 397] ^ (bits >>> 1) ^ ((bits & 1) * 0x9908b0df);
        }

        // remaining words (except the very last one)
        for (let i = 227; i < 623; i++) {
            const bits = (state[i] & 0x80000000) | (state[i + 1] & 0x7fffffff);

            state[i] = state[i - 227] ^ (bits >>> 1) ^ ((bits & 1) * 0x9908b0df);
        }

        // last word is computed pretty much the same way, but i + 1 must wrap around to 0
        const bits = (state[623] & 0x80000000) | (state[0] & 0x7fffffff);

        state[623] = state[396] ^ (bits >>> 1) ^ ((bits & 1) * 0x9908b0df);

        // word used for next random number
        this._iteration = 0;
        this._value = 0;
    }
}
