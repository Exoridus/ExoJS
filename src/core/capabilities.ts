/// <reference types="@webgpu/types" />

// Browser-environment feature detection. Construction is private; the
// only public entry is `Capabilities.ready`, a lazy-cached `Promise<Capabilities>`
// that fires the (mostly) async probes on first access and returns the
// same Promise for every subsequent call. Once it resolves, the returned
// instance is frozen — every property is read once and never mutates.
//
// Synchronous callsites should keep the resolved instance in scope (e.g.,
// `app.capabilities` after `await app.start(...)`); there is no global
// sync mirror, by design.

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';
const hasNavigator = typeof navigator !== 'undefined';

interface CapabilityValues {
    readonly webgl2: boolean;
    readonly webgpu: boolean;
    readonly webgpuAdapter: GPUAdapter | null;
    readonly webgpuVendor: string | null;
    readonly webgpuArchitecture: string | null;
    readonly pointer: boolean;
    readonly keyboard: boolean;
    readonly gamepad: boolean;
    readonly touch: boolean;
    readonly maxTouchPoints: number;
    readonly audio: boolean;
    readonly fullscreen: boolean;
    readonly vibration: boolean;
    readonly offscreenCanvas: boolean;
    readonly webWorkers: boolean;
    readonly devicePixelRatio: number;
}

export class Capabilities {

    private static _readyPromise: Promise<Capabilities> | null = null;

    /**
     * Lazy-cached Promise that resolves to a frozen Capabilities instance.
     *
     * The first read kicks off the async probes (currently just the WebGPU
     * adapter request); every subsequent read returns the same Promise.
     * Concurrent callers share the in-flight detection — no double work.
     *
     * Early-warmup pattern for callers who want to overlap detection with
     * other startup work:
     *
     * ```ts
     * void Capabilities.ready;          // fire-and-forget; starts probes now
     * // ... unrelated bootstrap ...
     * const caps = await Capabilities.ready;  // typically already resolved
     * ```
     */
    public static get ready(): Promise<Capabilities> {
        if (Capabilities._readyPromise === null) {
            Capabilities._readyPromise = Capabilities._detect();
        }

        return Capabilities._readyPromise;
    }

    public readonly webgl2: boolean;
    public readonly webgpu: boolean;
    public readonly webgpuAdapter: GPUAdapter | null;
    public readonly webgpuVendor: string | null;
    public readonly webgpuArchitecture: string | null;
    public readonly pointer: boolean;
    public readonly keyboard: boolean;
    public readonly gamepad: boolean;
    public readonly touch: boolean;
    public readonly maxTouchPoints: number;
    public readonly audio: boolean;
    public readonly fullscreen: boolean;
    public readonly vibration: boolean;
    public readonly offscreenCanvas: boolean;
    public readonly webWorkers: boolean;
    public readonly devicePixelRatio: number;

    private constructor(values: CapabilityValues) {
        this.webgl2 = values.webgl2;
        this.webgpu = values.webgpu;
        this.webgpuAdapter = values.webgpuAdapter;
        this.webgpuVendor = values.webgpuVendor;
        this.webgpuArchitecture = values.webgpuArchitecture;
        this.pointer = values.pointer;
        this.keyboard = values.keyboard;
        this.gamepad = values.gamepad;
        this.touch = values.touch;
        this.maxTouchPoints = values.maxTouchPoints;
        this.audio = values.audio;
        this.fullscreen = values.fullscreen;
        this.vibration = values.vibration;
        this.offscreenCanvas = values.offscreenCanvas;
        this.webWorkers = values.webWorkers;
        this.devicePixelRatio = values.devicePixelRatio;

        Object.freeze(this);
    }

    private static async _detect(): Promise<Capabilities> {
        const [webgpuAdapter, webgpuInfo] = await probeWebGpu();

        return new Capabilities({
            webgl2: probeWebGl2(),
            webgpu: probeWebGpuApiSurface(),
            webgpuAdapter,
            webgpuVendor: webgpuInfo?.vendor ?? null,
            webgpuArchitecture: webgpuInfo?.architecture ?? null,
            pointer: probePointer(),
            keyboard: probeKeyboard(),
            gamepad: probeGamepad(),
            touch: probeTouchSupported(),
            maxTouchPoints: probeMaxTouchPoints(),
            audio: probeAudio(),
            fullscreen: probeFullscreen(),
            vibration: probeVibration(),
            offscreenCanvas: probeOffscreenCanvas(),
            webWorkers: probeWebWorkers(),
            devicePixelRatio: hasWindow ? window.devicePixelRatio : 1,
        });
    }
}

// --- probes ---------------------------------------------------------------

function probeWebGl2(): boolean {
    if (!hasDocument) return false;

    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        return gl !== null;
    } catch {
        return false;
    }
}

function probeWebGpuApiSurface(): boolean {
    return hasNavigator && 'gpu' in navigator;
}

async function probeWebGpu(): Promise<[GPUAdapter | null, GPUAdapterInfo | null]> {
    if (!probeWebGpuApiSurface()) return [null, null];

    const gpu = (navigator as Navigator & { gpu?: GPU; }).gpu;

    if (!gpu || typeof gpu.requestAdapter !== 'function') return [null, null];

    try {
        const adapter = await gpu.requestAdapter();

        if (!adapter) return [null, null];

        // Modern path: GPUAdapter.info is a sync property (Chrome 116+,
        // Safari 18+). Older browsers exposed a deprecated async
        // requestAdapterInfo() instead. Try the modern path first, fall
        // back if needed.
        const adapterAny = adapter as GPUAdapter & {
            info?: GPUAdapterInfo;
            requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
        };

        if (adapterAny.info) {
            return [adapter, adapterAny.info];
        }

        if (typeof adapterAny.requestAdapterInfo === 'function') {
            try {
                return [adapter, await adapterAny.requestAdapterInfo()];
            } catch {
                return [adapter, null];
            }
        }

        return [adapter, null];
    } catch {
        return [null, null];
    }
}

function probePointer(): boolean {
    return hasWindow && 'PointerEvent' in window;
}

function probeKeyboard(): boolean {
    return hasWindow && 'KeyboardEvent' in window;
}

function probeGamepad(): boolean {
    return hasNavigator && typeof navigator.getGamepads === 'function';
}

function probeTouchSupported(): boolean {
    if (!hasWindow) return false;
    if ('ontouchstart' in window) return true;
    if (probeMaxTouchPoints() > 0) return true;
    return false;
}

function probeMaxTouchPoints(): number {
    if (!hasNavigator) return 0;
    const points = navigator.maxTouchPoints;
    return typeof points === 'number' ? points : 0;
}

function probeAudio(): boolean {
    if (!hasWindow) return false;
    const w = window as typeof window & { webkitAudioContext?: unknown; };
    return typeof w.AudioContext !== 'undefined' || typeof w.webkitAudioContext !== 'undefined';
}

function probeFullscreen(): boolean {
    if (!hasDocument) return false;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown; };
    return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

function probeVibration(): boolean {
    return hasNavigator && typeof navigator.vibrate === 'function';
}

function probeOffscreenCanvas(): boolean {
    // The browser global is verbatim `OffscreenCanvas`; eslint's
    // strict-camelCase rule rejects the property name even though we
    // can't rename a web standard.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return hasWindow && typeof (window as typeof window & { OffscreenCanvas?: unknown; }).OffscreenCanvas !== 'undefined';
}

function probeWebWorkers(): boolean {
    // The browser global is verbatim `Worker`; eslint's strict-camelCase
    // rule rejects the property name even though we can't rename a web
    // standard.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return hasWindow && typeof (window as typeof window & { Worker?: unknown; }).Worker === 'function';
}
