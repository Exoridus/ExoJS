import { Size } from '@/math/Size';
import { Random } from '@/math/Random';
import type { TextureSource } from '@/core/types';
import { Time } from '@/core/Time';

interface CanvasSourceWithDisplaySize {
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
}

const codecNotSupportedPattern = /^no$/;

let internalAudioElement: HTMLAudioElement | null = null;
let internalCanvasElement: HTMLCanvasElement | null = null;
let internalCanvasContext: CanvasRenderingContext2D | null = null;
let internalRandom: Random | null = null;
let supportsEventOptionsValue: boolean | null = null;

const canUseDocument = (): boolean => typeof document !== 'undefined';
const canUseWindow = (): boolean => typeof window !== 'undefined';

const getAudioElement = (): HTMLAudioElement => {
    if (!canUseDocument()) {
        throw new Error('Audio codec detection requires a document context.');
    }

    if (internalAudioElement === null) {
        internalAudioElement = document.createElement('audio') as HTMLAudioElement;
    }

    return internalAudioElement;
};

const getCanvasElement = (): HTMLCanvasElement => {
    if (!canUseDocument()) {
        throw new Error('Canvas operations require a document context.');
    }

    if (internalCanvasElement === null) {
        internalCanvasElement = document.createElement('canvas') as HTMLCanvasElement;
    }

    return internalCanvasElement;
};

const getCanvasContext = (): CanvasRenderingContext2D => {
    if (internalCanvasContext === null) {
        const context = getCanvasElement().getContext('2d');

        if (!context) {
            throw new Error('Could not create a 2D canvas context.');
        }

        internalCanvasContext = context;
    }

    return internalCanvasContext;
};

const getRandom = (): Random => {
    if (internalRandom === null) {
        internalRandom = new Random();
    }

    return internalRandom;
};

export const rand = (min?: number, max?: number): number => getRandom().next(min, max);
export const noop = (): void => { /* empty function */ };
export const stopEvent = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
};

export const supportsWebAudio: boolean = typeof AudioContext !== 'undefined';
export const supportsIndexedDb: boolean = typeof indexedDB !== 'undefined';
export const supportsTouchEvents: boolean = canUseWindow() && 'ontouchstart' in window;
export const supportsPointerEvents: boolean = typeof PointerEvent !== 'undefined';
export const supportsEventOptions = (): boolean => {
    if (supportsEventOptionsValue !== null) {
        return supportsEventOptionsValue;
    }

    if (!canUseWindow()) {
        supportsEventOptionsValue = false;

        return supportsEventOptionsValue;
    }

    let supportsPassive = false;

    try {
        window.addEventListener('test', noop, {
            get passive() {
                supportsPassive = true;

                return false;
            }
        });
        window.removeEventListener('test', noop);
    } catch (e) {
        // do nothing
    }

    supportsEventOptionsValue = supportsPassive;

    return supportsEventOptionsValue;
};

export const getPreciseTime = (): number => performance.now();
export const milliseconds = (value: number): Time => new Time(value, Time.milliseconds);
export const seconds = (value: number): Time => new Time(value, Time.seconds);
export const minutes = (value: number): Time => new Time(value, Time.minutes);
export const hours = (value: number): Time => new Time(value, Time.hours);

export const emptyArrayBuffer = new ArrayBuffer(0);

export const removeArrayItems = <T = unknown>(array: Array<T>, startIndex: number, amount: number): Array<T> => {
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

export const supportsCodec = (...codecs: Array<string>): boolean => codecs.some((codec) => getAudioElement().canPlayType(codec).replace(codecNotSupportedPattern, ''));

export const getCanvasSourceSize = (source: CanvasImageSource): Size => {
    const dynamicSource = source as CanvasSourceWithDisplaySize;

    if (source instanceof HTMLImageElement) {
        return Size.temp.set(source.naturalWidth, source.naturalHeight);
    }

    if (source instanceof HTMLVideoElement) {
        return Size.temp.set(source.videoWidth, source.videoHeight);
    }

    if (source instanceof SVGElement) {
        return Size.temp.copy(source.getBoundingClientRect());
    }

    if (typeof dynamicSource.displayWidth === 'number' && typeof dynamicSource.displayHeight === 'number') {
        return Size.temp.set(dynamicSource.displayWidth, dynamicSource.displayHeight);
    }

    if (typeof dynamicSource.width === 'number' && typeof dynamicSource.height === 'number') {
        return Size.temp.set(dynamicSource.width, dynamicSource.height);
    }

    return Size.zero;
};

export const getTextureSourceSize = (source: TextureSource): Size => {
    if (source === null) {
        return Size.zero;
    }

    return getCanvasSourceSize(source);
};

export const canvasSourceToDataUrl = (source: CanvasImageSource): string => {
    const { width, height } = getCanvasSourceSize(source);
    const canvasElement = getCanvasElement();

    canvasElement.width = width;
    canvasElement.height = height;

    getCanvasContext().drawImage(source, 0, 0, width, height);

    return canvasElement.toDataURL();
};
