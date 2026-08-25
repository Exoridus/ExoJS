/// <reference types="@webgpu/types" />

// Browser-environment feature detection. Construction is private; the
// only public entry is `Capabilities.ready`, a lazy-cached `Promise<Capabilities>`
// that fires the (mostly) async probes on first access and returns the
// same Promise for every subsequent call. Once it resolves, the returned
// instance is frozen - every property is read once and never mutates.
//
// Synchronous callsites should keep the resolved instance in scope (e.g.,
// `app.capabilities` after `await app.start(...)`); there is no global
// sync mirror, by design.

import { getWebGl2Context, type RenderSurface } from '#platform/RenderSurface';

/**
 * Which kind of global scope the probes ran in. Capabilities are realm-local:
 * the same browser reports different answers on its main thread and inside a
 * worker, and neither answer is wrong.
 *
 * - `'window'`: a document's main thread. Input, audio and layout exist.
 * - `'worker'`: a dedicated worker. No document, so no DOM input, no CSS
 *   pixel ratio and no `AudioContext`, but `OffscreenCanvas` rendering and
 *   nested workers are available.
 * - `'unknown'`: neither - a server-side render, or an embedding host.
 */
export type HostRealm = 'window' | 'worker' | 'unknown';

const hasWindow = 'window' in globalThis;
const hasDocument = typeof document !== 'undefined';
const hasNavigator = typeof navigator !== 'undefined';
// `WorkerGlobalScope` rather than `DedicatedWorkerGlobalScope`, and reached
// through `Reflect.get` rather than referenced directly: the worker lib is not
// in scope for a DOM build, and module workers - unlike classic ones - have no
// `importScripts` to detect instead.
const workerGlobalScope = Reflect.get(globalThis, 'WorkerGlobalScope') as (abstract new () => object) | undefined;
const hasWorkerScope = workerGlobalScope !== undefined && globalThis instanceof workerGlobalScope;

function detectRealm(): HostRealm {
  if (hasWindow && hasDocument) return 'window';
  if (hasWorkerScope) return 'worker';
  return 'unknown';
}

const realm: HostRealm = detectRealm();

interface CapabilityValues {
  readonly realm: HostRealm;
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
  readonly imageBitmap: boolean;
  readonly deviceMemory: number;
  readonly offscreenCanvas: boolean;
  readonly offscreenWebgl2: boolean;
  readonly webWorkers: boolean;
  readonly devicePixelRatio: number;
}

/**
 * Frozen snapshot of host-environment feature support: which renderer
 * backends are available, which input modalities are present, audio /
 * fullscreen / vibration / OffscreenCanvas / Worker support, max touch
 * points, and the resolved devicePixelRatio.
 *
 * Construction is private - the only public entry is
 * {@link Capabilities.ready}, a lazy-cached `Promise<Capabilities>` that
 * fires the (mostly) async probes on first access. The resolved instance
 * is frozen and never mutates. {@link Application.capabilities} returns
 * the same instance once `app.start()` has resolved.
 */
export class Capabilities {
  private static _readyPromise: Promise<Capabilities> | null = null;

  /**
   * Lazy-cached Promise that resolves to a frozen Capabilities instance.
   *
   * The first read kicks off the async probes (currently just the WebGPU
   * adapter request); every subsequent read returns the same Promise.
   * Concurrent callers share the in-flight detection - no double work.
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

  /** The global scope the probes ran in. See {@link HostRealm}. */
  public readonly realm: HostRealm;
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
  public readonly imageBitmap: boolean;
  public readonly deviceMemory: number;
  public readonly offscreenCanvas: boolean;
  /**
   * Whether a WebGL2 context can actually be created on an `OffscreenCanvas`
   * in this realm - probed by creating one, not inferred from the constructor
   * being defined. The two can differ: a host may expose `OffscreenCanvas`
   * and still refuse it a GPU-backed context.
   */
  public readonly offscreenWebgl2: boolean;
  public readonly webWorkers: boolean;
  /**
   * The host's CSS-to-device pixel ratio, or `1` where there is no document to
   * ask - a worker has no ratio of its own and inherits whatever its host
   * decided the surface's backing size should be.
   */
  public readonly devicePixelRatio: number;

  private constructor(values: CapabilityValues) {
    this.realm = values.realm;
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
    this.imageBitmap = values.imageBitmap;
    this.deviceMemory = values.deviceMemory;
    this.offscreenCanvas = values.offscreenCanvas;
    this.offscreenWebgl2 = values.offscreenWebgl2;
    this.webWorkers = values.webWorkers;
    this.devicePixelRatio = values.devicePixelRatio;

    Object.freeze(this);
  }

  private static async _detect(): Promise<Capabilities> {
    const [webgpuAdapter, webgpuInfo] = await probeWebGpu();

    return new Capabilities({
      realm,
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
      imageBitmap: probeImageBitmap(),
      deviceMemory: probeDeviceMemory(),
      offscreenCanvas: probeOffscreenCanvas(),
      offscreenWebgl2: probeOffscreenWebGl2(),
      webWorkers: probeWebWorkers(),
      devicePixelRatio: hasWindow ? window.devicePixelRatio : 1,
    });
  }
}

// --- probes ---------------------------------------------------------------

/**
 * A 1x1 scratch surface to acquire a probe context on: a canvas element where
 * there is a document, an `OffscreenCanvas` otherwise. `null` when the realm
 * offers neither.
 */
function createProbeSurface(offscreenOnly = false): RenderSurface | null {
  if (!offscreenOnly && hasDocument) {
    return document.createElement('canvas');
  }

  if (typeof OffscreenCanvas === 'undefined') {
    return null;
  }

  return new OffscreenCanvas(1, 1);
}

/**
 * Whether `surface` hands out a WebGL2 context, releasing it again.
 *
 * The release matters: browsers cap how many live WebGL contexts a page may
 * hold and evict the oldest once the cap is reached, so a probe that keeps its
 * context is one slot the application can no longer use. Two probes run here,
 * which without this would cost two of them.
 */
function acquiresWebGl2(surface: RenderSurface): boolean {
  const gl = getWebGl2Context(surface);

  if (gl === null) {
    return false;
  }

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return true;
}

function probeWebGl2(): boolean {
  try {
    const surface = createProbeSurface();

    return surface !== null && acquiresWebGl2(surface);
  } catch {
    return false;
  }
}

function probeOffscreenWebGl2(): boolean {
  try {
    const surface = createProbeSurface(true);

    return surface !== null && acquiresWebGl2(surface);
  } catch {
    return false;
  }
}

function probeWebGpuApiSurface(): boolean {
  return hasNavigator && 'gpu' in navigator;
}

async function probeWebGpu(): Promise<[GPUAdapter | null, GPUAdapterInfo | null]> {
  if (!probeWebGpuApiSurface()) return [null, null];

  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;

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

// Pointer and keyboard are document-scoped: a worker can construct neither the
// event nor a target to receive it, so a realm without a document has no input
// of its own regardless of which constructors happen to be defined in it.
function probePointer(): boolean {
  return hasWindow && 'PointerEvent' in globalThis;
}

function probeKeyboard(): boolean {
  return hasWindow && 'KeyboardEvent' in globalThis;
}

function probeGamepad(): boolean {
  return hasNavigator && typeof navigator.getGamepads === 'function';
}

function probeTouchSupported(): boolean {
  if (!hasWindow) return false;
  if ('ontouchstart' in globalThis) return true;
  if (probeMaxTouchPoints() > 0) return true;
  return false;
}

function probeMaxTouchPoints(): number {
  if (!hasNavigator) return 0;
  const points = navigator.maxTouchPoints;
  return typeof points === 'number' ? points : 0;
}

// `AudioContext` is window-scoped by specification - a worker cannot construct
// one even where the identifier resolves.
function probeAudio(): boolean {
  if (!hasWindow) return false;
  const w = globalThis as typeof globalThis & { webkitAudioContext?: unknown };
  return w.AudioContext !== undefined || w.webkitAudioContext !== undefined;
}

function probeFullscreen(): boolean {
  if (!hasDocument) return false;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

function probeVibration(): boolean {
  return hasNavigator && typeof navigator.vibrate === 'function';
}

function probeImageBitmap(): boolean {
  return typeof createImageBitmap === 'function';
}

function probeDeviceMemory(): number {
  if (!hasNavigator) return 0;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' ? mem : 0;
}

// Both are realm globals rather than window properties: a dedicated worker has
// `OffscreenCanvas` and can spawn nested workers, and reading them off `window`
// would report "unsupported" for the one realm that most needs them.
function probeOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

function probeWebWorkers(): boolean {
  return typeof Worker === 'function';
}
