import { Time } from '@/core/Time';
import type { TextureSource } from '@/core/types';
import { Random } from '@/math/Random';
import { Size } from '@/math/Size';

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
    internalAudioElement = document.createElement('audio');
  }

  return internalAudioElement;
};

const getCanvasElement = (): HTMLCanvasElement => {
  if (!canUseDocument()) {
    throw new Error('Canvas operations require a document context.');
  }

  if (internalCanvasElement === null) {
    internalCanvasElement = document.createElement('canvas');
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

/**
 * Random number in the range `[min, max]` from the module-level shared
 * {@link Random} instance. Pass no arguments for `[0, 1)`. For deterministic
 * sequences create your own seeded `Random` instance instead.
 */
export const rand = (min?: number, max?: number): number => getRandom().next(min, max);

/** Empty function literal — useful as a default callback that does nothing. */
export const noop = (): void => {
  /* empty function */
};

/** `preventDefault()` + `stopImmediatePropagation()` on an event in one call. */
export const stopEvent = (event: Event): void => {
  event.preventDefault();
  event.stopImmediatePropagation();
};

/** Snapshot at module-load: `true` when `AudioContext` is defined. */
export const supportsWebAudio: boolean = typeof AudioContext !== 'undefined';
/** Snapshot at module-load: `true` when `indexedDB` is defined. */
export const supportsIndexedDb: boolean = typeof indexedDB !== 'undefined';
/** Snapshot at module-load: `true` when the touch event API is detected. */
export const supportsTouchEvents: boolean = canUseWindow() && 'ontouchstart' in window;
/** Snapshot at module-load: `true` when `PointerEvent` is defined. */
export const supportsPointerEvents: boolean = typeof PointerEvent !== 'undefined';

/**
 * Lazy-cached probe for the third `EventListenerOptions` argument to
 * `addEventListener` (passive/capture object). Older browsers ignore the
 * object and treat it as the boolean `useCapture`. Probed once on first call.
 */
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
      },
    });
    window.removeEventListener('test', noop);
  } catch (_e) {
    // do nothing
  }

  supportsEventOptionsValue = supportsPassive;

  return supportsEventOptionsValue;
};

/** High-resolution monotonic clock reading in milliseconds. Wraps `performance.now()`. */
export const getPreciseTime = (): number => performance.now();

/** Construct a {@link Time} value from a millisecond count. */
export const milliseconds = (value: number): Time => new Time(value, Time.milliseconds);
/** Construct a {@link Time} value from a second count. */
export const seconds = (value: number): Time => new Time(value, Time.seconds);
/** Construct a {@link Time} value from a minute count. */
export const minutes = (value: number): Time => new Time(value, Time.minutes);
/** Construct a {@link Time} value from an hour count. */
export const hours = (value: number): Time => new Time(value, Time.hours);

/**
 * Trigger a device vibration pattern via the
 * [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API).
 *
 * Returns `true` if the vibration was accepted, `false` when the API is
 * unavailable or the browser suppressed the call. Guard with
 * `Capabilities.vibration` if you need to distinguish the two cases before
 * calling.
 *
 * @param pattern - Duration in milliseconds, or alternating on/off array.
 */
export const vibrate = (pattern: VibratePattern): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  return navigator.vibrate(pattern);
};

/** Shared zero-length `ArrayBuffer` for use as a sentinel / default. */
export const emptyArrayBuffer = new ArrayBuffer(0);

/**
 * Remove `amount` items from `array` starting at `startIndex`, in place.
 * Faster than `Array.prototype.splice` for the common case because it
 * skips the allocation of a removed-items array. Returns the same array
 * for chaining.
 */
export const removeArrayItems = <T = unknown>(array: T[], startIndex: number, amount: number): T[] => {
  if (startIndex < array.length && amount > 0) {
    const removeCount = startIndex + amount > array.length ? array.length - startIndex : amount;

    const newLen = array.length - removeCount;

    for (let i = startIndex; i < newLen; i++) {
      array[i] = array[i + removeCount];
    }

    array.length = newLen;
  }

  return array;
};

/**
 * `true` when the host browser reports any of the given media-codec
 * strings as playable on a transient `<audio>` element. Use to gate format
 * selection (e.g. prefer OGG, fall back to MP3).
 */
export const supportsCodec = (...codecs: string[]): boolean => codecs.some(codec => getAudioElement().canPlayType(codec).replace(codecNotSupportedPattern, ''));

/**
 * Resolve the natural pixel dimensions of any `CanvasImageSource`. Returns
 * a {@link Size.temp} scratch instance — copy if you need to retain the
 * value. Returns {@link Size.zero} when the source has no resolvable size.
 */
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

/**
 * Resolve the natural pixel dimensions of a {@link TextureSource}, treating
 * `null` as zero. Same caveats as {@link getCanvasSourceSize} — shared
 * scratch instance.
 */
export const getTextureSourceSize = (source: TextureSource): Size => {
  if (source === null) {
    return Size.zero;
  }

  return getCanvasSourceSize(source);
};

/**
 * Render any `CanvasImageSource` to the shared scratch 2D-canvas and return
 * the result as a `data:` URL. Used by {@link Application.setCursor} to
 * accept arbitrary image sources as the CSS cursor value.
 */
export const canvasSourceToDataUrl = (source: CanvasImageSource): string => {
  const { width, height } = getCanvasSourceSize(source);
  const canvasElement = getCanvasElement();

  canvasElement.width = width;
  canvasElement.height = height;

  getCanvasContext().drawImage(source, 0, 0, width, height);

  return canvasElement.toDataURL();
};
