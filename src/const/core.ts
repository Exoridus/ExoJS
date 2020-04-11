import { supportsEventOptions } from "../support";

export const TIMING: DateConstructor | Performance = (typeof performance === 'undefined' ? Date : performance);

export const AUDIO_ELEMENT = <HTMLAudioElement>document.createElement('audio');

export const GlobalCanvasElement = <HTMLCanvasElement>document.createElement('canvas');

export const GlobalAudioContext: AudioContext = new AudioContext();

export const GlobalCanvasContext = <CanvasRenderingContext2D>GlobalCanvasElement.getContext('2d');

export const CodecNotSupportedPattern = /^no$/;

export const EmptyArrayBuffer = new ArrayBuffer(0);

export const activeListenerOption: AddEventListenerOptions | boolean = supportsEventOptions ? { capture: true, passive: false } : true;

export const passiveListenerOption: AddEventListenerOptions | boolean = supportsEventOptions ? { capture: true, passive: true } : true;

export const onceListenerOption: AddEventListenerOptions | boolean = supportsEventOptions ? { capture: false, once: true } : false;

export const noop = () => {};

export enum AppStatus {
    UNKNOWN = 0,
    LOADING = 1,
    RUNNING = 2,
    HALTING = 3,
    STOPPED = 4,
}

export enum TimeInterval {
    MILLISECONDS = 1,
    SECONDS = 1000,
    MINUTES = 60000,
    HOURS = 3600000,
}

export enum Flags {
    NONE = 0x00,
    TRANSLATION = 0x01,
    ROTATION = 0x02,
    SCALING = 0x04,
    ORIGIN = 0x08,
    TRANSFORM = 0x0F,
    TRANSFORM_INV = 0x10,
    BOUNDING_BOX = 0x20,
    TEXTURE_COORDS = 0x40,
    VERTEX_TINT = 0x80,
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