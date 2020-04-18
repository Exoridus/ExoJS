export type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array;

export interface PlaybackOptions {
    volume: number;
    loop: boolean;
    speed: number;
    time: number;
    muted: boolean;
}

export type TypedEnum<Enum, Type> = { [Key in keyof Enum]: Type };

export type ValueOf<T> = T[keyof T];

export interface Cloneable<T> {
    clone(): T;
    copy(source: T): this;
}