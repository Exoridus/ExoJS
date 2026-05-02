// Browser feature-detection probes evaluated once at module load. The
// resulting `capabilities` object is a `Readonly<Record<CapabilityName,
// boolean>>` and can be inspected directly or queried via `isSupported`.
//
// All probes are synchronous. Async questions ("can I actually acquire a
// WebGPU adapter?", "can the audio decoder play this OGG file?") are
// outside this module's scope — they're owned by the Application's
// backend selection and the Loader respectively. `capabilities.webgpu`
// returning `true` only guarantees that the browser advertises WebGPU,
// not that an adapter request will succeed.

interface CapabilitiesShape {
    /** A real WebGL2 context can be created on a probe canvas. */
    readonly webgl2: boolean;
    /** `navigator.gpu` is present. Does NOT guarantee adapter availability. */
    readonly webgpu: boolean;
    /** `AudioContext` (standard or `webkit`-prefixed) is constructable. */
    readonly audio: boolean;
    /** `PointerEvent` is supported. */
    readonly pointer: boolean;
    /** Touch input is exposed via `ontouchstart` or `maxTouchPoints > 0`. */
    readonly touch: boolean;
    /** `navigator.getGamepads` is available. */
    readonly gamepad: boolean;
    /** `KeyboardEvent` is supported. */
    readonly keyboard: boolean;
    /** The Fullscreen API is exposed on the document element. */
    readonly fullscreen: boolean;
    /** `navigator.vibrate` is available. */
    readonly vibration: boolean;
    /** `OffscreenCanvas` constructor is on the global. */
    readonly offscreenCanvas: boolean;
}

export type Capabilities = CapabilitiesShape;
export type CapabilityName = keyof CapabilitiesShape;

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';
const hasNavigator = typeof navigator !== 'undefined';

const probeWebGl2 = (): boolean => {
    if (!hasDocument) return false;

    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        return gl !== null;
    } catch {
        return false;
    }
};

const probeWebGpu = (): boolean => {
    return hasNavigator && 'gpu' in navigator;
};

const probeAudio = (): boolean => {
    if (!hasWindow) return false;
    const w = window as typeof window & { webkitAudioContext?: unknown; };
    return typeof w.AudioContext !== 'undefined' || typeof w.webkitAudioContext !== 'undefined';
};

const probePointer = (): boolean => {
    return hasWindow && 'PointerEvent' in window;
};

const probeTouch = (): boolean => {
    if (!hasWindow) return false;
    if ('ontouchstart' in window) return true;
    if (hasNavigator && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) return true;
    return false;
};

const probeGamepad = (): boolean => {
    return hasNavigator && typeof navigator.getGamepads === 'function';
};

const probeKeyboard = (): boolean => {
    return hasWindow && 'KeyboardEvent' in window;
};

const probeFullscreen = (): boolean => {
    if (!hasDocument) return false;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown; };
    return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
};

const probeVibration = (): boolean => {
    return hasNavigator && typeof navigator.vibrate === 'function';
};

const probeOffscreenCanvas = (): boolean => {
    // The browser global is verbatim `OffscreenCanvas`; eslint's
    // strict-camelCase rule rejects the property name even though we
    // can't rename a web standard.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return hasWindow && typeof (window as typeof window & { OffscreenCanvas?: unknown; }).OffscreenCanvas !== 'undefined';
};

/**
 * Synchronous, one-shot feature-detection results. Computed once at
 * module load and frozen. Use either as a property bag (`capabilities.touch`)
 * or via {@link isSupported} for typed lookup.
 */
export const capabilities: Capabilities = Object.freeze({
    webgl2: probeWebGl2(),
    webgpu: probeWebGpu(),
    audio: probeAudio(),
    pointer: probePointer(),
    touch: probeTouch(),
    gamepad: probeGamepad(),
    keyboard: probeKeyboard(),
    fullscreen: probeFullscreen(),
    vibration: probeVibration(),
    offscreenCanvas: probeOffscreenCanvas(),
});

/**
 * Typed lookup over {@link capabilities}. Identical to
 * `capabilities[name]` but the function form gives clearer call-sites
 * when the name is computed.
 */
export function isSupported(name: CapabilityName): boolean {
    return capabilities[name];
}
