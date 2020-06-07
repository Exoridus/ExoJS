import type { Rectangle } from 'math/Rectangle';

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

export interface IPlaybackOptions {
    volume: number;
    playbackRate: number;
    loop: boolean;
    muted: boolean;
    time: number;
}

export interface ICloneable {
    clone(): this;
    copy(source: this): this;
}

export interface IDestroyable {
    destroy(): void;
}

export interface IWithBoundingBox {
    getBounds(): Rectangle;
}

export enum ResourceTypes {
    font = 'font',
    video = 'video',
    music = 'music',
    sound = 'sound',
    image = 'image',
    texture = 'texture',
    text = 'text',
    json = 'json',
    svg = 'svg',
}

export enum StorageNames {
    font = 'font',
    video = 'video',
    music = 'music',
    sound = 'sound',
    image = 'image',
    text = 'text',
    json = 'json',
}