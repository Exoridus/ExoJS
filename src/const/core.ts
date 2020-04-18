import { supportsEventOptions } from "./support";
import { Random } from "math/Random";

export const internalAudioElement = document.createElement('audio') as HTMLAudioElement;
export const internalCanvasElement = document.createElement('canvas') as HTMLCanvasElement;
export const internalCanvasContext = internalCanvasElement.getContext('2d') as CanvasRenderingContext2D;
export const internalRandom = new Random();

export const codecNotSupportedPattern = /^no$/;
export const emptyArrayBuffer = new ArrayBuffer(0);

export const activeListenerOption: AddEventListenerOptions | boolean = supportsEventOptions ? { capture: true, passive: false } : true;
export const passiveListenerOption: AddEventListenerOptions | boolean = supportsEventOptions ? { capture: true, passive: true } : true;
export const onceListenerOption: AddEventListenerOptions | boolean = supportsEventOptions ? { capture: false, once: true } : false;

export const noop = (): void => { /* empty function */ };

export enum AppStatus {
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