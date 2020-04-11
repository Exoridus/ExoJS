export type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array;

export enum StorageType {
    Resource = 'resource',
    ArrayBuffer = 'arrayBuffer',
    Blob = 'blob',
    Font = 'font',
    Image = 'image',
    Json = 'json',
    Music = 'music',
    Sound = 'sound',
    Svg = 'svg',
    Texture = 'texture',
    Video = 'video',
}

export interface PlaybackOptions {
    volume?: number;
    loop?: boolean;
    speed?: number;
    time?: number;
    muted?: boolean;
}