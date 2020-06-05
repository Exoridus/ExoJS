import type { Rectangle } from "math/Rectangle";

export type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array;
export type TimeInterval = 1 | 1000 | 60000 | 3600000;
export type TypedEnum<Enum, Type> = { [Key in keyof Enum]: Type };
export type ValueOf<T> = T[keyof T];
export type Mutable<T> = {
    -readonly[P in keyof T]: T[P]
};
export type Readonly<T> = {
    readonly[P in keyof T]: T[P]
};

export type TextureSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | null;

export interface PlaybackOptions {
    volume: number;
    playbackRate: number;
    loop: boolean;
    muted: boolean;
    time: number;
}

export interface Cloneable {
    clone(): this;
    copy(source: this): this;
}

export interface Deletable {
    destroy(): void;
}

export interface WithBoundingBox {
    getBounds(): Rectangle;
}

export enum ResourceTypes {
    Font = 'font',
    Video = 'video',
    Music = 'music',
    Sound = 'sound',
    Image = 'image',
    Texture = 'texture',
    Text = 'text',
    Json = 'json',
    Svg = 'svg',
}

export enum StorageNames {
    Font = 'font',
    Video = 'video',
    Music = 'music',
    Sound = 'sound',
    Image = 'image',
    Text = 'text',
    Json = 'json',
}