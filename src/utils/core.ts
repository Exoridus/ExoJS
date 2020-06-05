import { Size } from 'math/Size';
import { Random } from "math/Random";
import type { TextureSource } from "types/types";
import { Time } from "core/Time";

const codecNotSupportedPattern = /^no$/;
const internalAudioElement = document.createElement('audio') as HTMLAudioElement;
const internalCanvasElement = document.createElement('canvas') as HTMLCanvasElement;
const internalCanvasContext = internalCanvasElement.getContext('2d') as CanvasRenderingContext2D;
const internalRandom = new Random();

export const rand = (min?: number, max?: number): number => internalRandom.next(min, max);
export const noop = (): void => { /* empty function */ };
export const stopEvent = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
};

export const supportsWebAudio: boolean = ('AudioContext' in window);
export const supportsIndexedDB: boolean = ('indexedDB' in window);
export const supportsTouchEvents: boolean = ('ontouchstart' in window);
export const supportsPointerEvents: boolean = ('PointerEvent' in window);
export const supportsEventOptions: boolean = ((): boolean => {
    let supportsPassive = false;

    try {
        window.addEventListener('test', noop, {
            get passive() {
                supportsPassive = true;

                return false;
            }
        });
    } catch (e) {
        // do nothing
    }

    return supportsPassive;
})();

export const getPreciseTime = (): number => performance.now();
export const milliseconds = (value: number): Time => new Time(value, Time.Milliseconds);
export const seconds = (value: number): Time => new Time(value, Time.Seconds);
export const minutes = (value: number): Time => new Time(value, Time.Minutes);
export const hours = (value: number): Time => new Time(value, Time.Hours);

export const emptyArrayBuffer = new ArrayBuffer(0);

export const removeArrayItems = <T = any>(array: Array<T>, startIndex: number, amount: number): Array<T> => {
    if (startIndex < array.length && amount > 0) {
        const removeCount = (startIndex + amount > array.length)
            ? (array.length - startIndex)
            : amount;

        const newLen = (array.length - removeCount);

        for (let i = startIndex; i < newLen; i++) {
            array[i] = array[i + removeCount];
        }

        array.length = newLen;
    }

    return array;
};

export const supportsCodec = (...codecs: Array<string>): boolean => codecs.some((codec) => internalAudioElement.canPlayType(codec).replace(codecNotSupportedPattern, ''));

export const getCanvasSourceSize = (source: CanvasImageSource): Size => {

    if (source instanceof HTMLImageElement) {
        return Size.Temp.set(source.naturalWidth, source.naturalHeight);
    }

    if (source instanceof HTMLVideoElement) {
        return Size.Temp.set(source.videoWidth, source.videoHeight);
    }

    if (source instanceof SVGElement) {
        return Size.Temp.copy(source.getBoundingClientRect());
    }

    return Size.Temp.set(source.width, source.height);
};

export const getTextureSourceSize = (source: TextureSource): Size => {
    if (source === null) {
        return Size.Zero;
    }

    return getCanvasSourceSize(source);
};

export const canvasSourceToDataURL = (source: CanvasImageSource): string => {
    const { width, height } = getCanvasSourceSize(source);

    internalCanvasElement.width = width;
    internalCanvasElement.height = height;

    internalCanvasContext.drawImage(source, 0, 0, width, height);

    return internalCanvasElement.toDataURL();
};