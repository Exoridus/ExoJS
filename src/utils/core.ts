import { internalAudioElement, internalCanvasElement, internalCanvasContext, codecNotSupportedPattern } from 'const/core';
import { TextureSource } from "rendering/texture/Texture";
import { Size } from 'math/Size';

export const stopEvent = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
};

export const getPreciseTime = () => performance.now();

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