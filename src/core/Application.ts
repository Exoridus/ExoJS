import { TweenManager } from '#animation/TweenManager';
import { AudioManager } from '#audio/AudioManager';
import type { Extension } from '#extensions/Extension';
import { getGlobalSnapshotInternal } from '#extensions/ExtensionRegistry';
import { materializeApplicationSystems, materializeAssetBindings, materializeRendererBindings, materializeSerializerBindings } from '#extensions/materialize';
import { buildSnapshot, type ExtensionSnapshot } from '#extensions/snapshot';
import { FocusManager } from '#input/FocusManager';
import type { GamepadDefinition } from '#input/GamepadDefinitions';
import type { GamepadSlotStrategy } from '#input/InputManager';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { PointLike } from '#math/PointLike';
import { Random } from '#math/Random';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderError, type RenderErrorCode } from '#rendering/RenderError';
import { type CaptureOptions, RenderingContext } from '#rendering/RenderingContext';
import { type RenderNode } from '#rendering/RenderNode';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader, type LoaderOptions } from '#resources/Loader';

import { Capabilities } from './capabilities';
import { Clock } from './Clock';
import { Color } from './Color';
import { assert, invariant } from './dev';
import { showDevErrorOverlay } from './devErrorOverlay';
import { FixedTimestep } from './FixedTimestep';
import { computeLetterboxLayout } from './letterbox';
import { hello, logger } from './logging';
import { Perf } from './Perf';
import { SceneDirector } from './SceneDirector';
import type { AnySceneConstructor, ChangeSceneArgs, InferSceneData, SceneRegistryShape } from './SceneTypes';
import { defaultSerializationRegistry, SerializationRegistry } from './serialization/SerializationRegistry';
import { Signal } from './Signal';
import { SystemRegistry } from './SystemRegistry';
import { Time } from './Time';
import { canvasSourceToDataUrl } from './utils';

export enum ApplicationStatus {
  Loading = 1,
  Running = 2,
  Halting = 3,
  Stopped = 4,
}

/** How {@link Application} sizes its canvas within the parent element. */
export type CanvasSizingMode = 'fixed' | 'fill' | 'fit' | 'shrink' | 'letterbox';

export interface CanvasApplicationOptions {
  /** Existing canvas element to use. If omitted, Application creates one. */
  element?: HTMLCanvasElement;
  /** Logical canvas width. Default: 800. */
  width?: number;
  /** Logical canvas height. Default: 600. */
  height?: number;
  /**
   * Device/render pixel ratio applied to the backing buffer. Default: the
   * host `devicePixelRatio` clamped to `2` (crisp on Retina/HiDPI out of the
   * box, capped so DPR-3 phones don't pay a 9× fill-rate cost). Pass an
   * explicit value to override — e.g. `window.devicePixelRatio` for full
   * native density, or `1` to force logical-pixel rendering.
   */
  pixelRatio?: number;
  /** Canvas tabIndex. Default: -1, preserving current behavior. */
  tabIndex?: number;
  /** CSS image-rendering hint applied to the canvas style. */
  imageRendering?: 'auto' | 'pixelated' | 'crisp-edges';
  /**
   * Element (or CSS selector) to append the canvas to on construction. If
   * omitted, the canvas is created but not mounted — append it yourself.
   */
  mount?: HTMLElement | string;
  /**
   * How the canvas is sized within its parent (needs a parent via `mount`, or
   * an `element` already in the DOM):
   * - `'fixed'` (default): exactly `width`×`height`.
   * - `'fill'`: track the parent's size via `ResizeObserver` and re-render to
   *   fill it; `width`/`height` are the initial size.
   * - `'fit'`: render at `width`×`height` and CSS-scale to fit the parent,
   *   preserving aspect ratio (letterboxed).
   * - `'shrink'`: like `'fit'` but never upscale beyond `width`×`height` —
   *   shrinks on smaller screens, stays native on larger ones.
   * - `'letterbox'`: track the parent's size, render the backing store at the
   *   parent size × `pixelRatio` (always crisp, no CSS upscale-blur), and keep
   *   the camera locked to the fixed `width`×`height` design space, centered
   *   and letterboxed with bars (no crop, no stretch). The "author once at a
   *   reference resolution" model.
   */
  sizingMode?: CanvasSizingMode;
}

export interface RenderingApplicationOptions {
  /** WebGL2-only debug wrapper. Ignored by WebGPU. */
  debug?: boolean;
  /** WebGL2 context attributes. Ignored by WebGPU. */
  webglAttributes?: WebGLContextAttributes;
  /** WebGL2 sprite renderer batch size. Ignored by WebGPU. */
  spriteRendererBatchSize?: number;
}

export interface InputApplicationOptions {
  gamepadDefinitions?: GamepadDefinition[];
  gamepadSlotStrategy?: GamepadSlotStrategy;
  pointerDistanceThreshold?: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty registry is a valid default
export interface ApplicationOptions<Registry extends SceneRegistryShape<Registry> = {}> {
  clearColor?: Color;
  backend?: BackendConfig;
  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
  /** Seed for the per-Application {@link Application.random} RNG. Omit for a non-deterministic seed. */
  seed?: number;
  /**
   * Print the one-time `ExoJS v{version}` startup banner to the console on
   * {@link Application.start}. Development-only (no-op in production
   * builds) and printed at most once per process regardless of how many
   * `Application`s are constructed. Default `true`.
   */
  hello?: boolean;
  /**
   * Fixed-timestep size in **seconds** for {@link Scene.fixedUpdate} / {@link Application.onFixedFrame}.
   * Default `1 / 60`. Must be positive.
   */
  fixedTimeStep?: number;
  /**
   * Extension selection.
   * `undefined` → Core + globally registered extensions.
   * `[]`         → Core only.
   * `[a, b, …]` → Core + exactly these; global registry not consulted.
   * Captured once at construction; later registrations do not affect
   * already-constructed Applications.
   */
  extensions?: readonly Extension[];
  /**
   * Registry of navigable {@link Scene} constructors, keyed by a name used
   * for diagnostics (shown in {@link UnregisteredSceneError} messages and
   * duplicate-registration errors) and for key-based navigation. Each value
   * is either a bare {@link Scene} subclass constructor, or a
   * `{ scene, transition? }` descriptor pairing one with a target-bound
   * default transition, consulted by {@link SceneDirector.change}/
   * {@link SceneDirector.restore} whenever navigation targets this
   * constructor without its own call-site `transition` option (spec §3.10)
   * — see {@link SceneRegistration}. Required for any {@link Application.start} /
   * {@link SceneDirector.change} call that targets a constructor —
   * unregistered targets reject in development builds. Validated once at
   * construction: every value must resolve to a {@link Scene} subclass
   * constructor (checked without instantiating it), and no constructor may
   * appear under more than one key.
   */
  scenes?: Registry;
}

export interface WebGl2BackendConfig {
  type: 'webgl2';
}

export interface WebGpuBackendConfig {
  type: 'webgpu';
}

export interface AutoBackendConfig {
  type: 'auto';
}

export type BackendConfig = AutoBackendConfig | WebGl2BackendConfig | WebGpuBackendConfig;

/**
 * One entry of the bounded {@link Application.recentErrors} ring buffer —
 * a JSON-friendly snapshot of an engine error (feeds future debug dumps).
 */
export interface RecentErrorEntry {
  /** `Date.now()` at the moment the error was recorded. */
  readonly time: number;
  readonly message: string;
  /** Machine-readable failure class — present for {@link RenderError}s. */
  readonly code?: RenderErrorCode;
  readonly stack?: string;
}

const maxDeltaMs = 100;
/** Default fixed-timestep size in milliseconds (60 Hz). */
const defaultFixedStepMs = 1000 / 60;
/** Max fixed steps run in one frame — the spiral-of-death guard. */
const maxFixedSteps = 5;
/** Consecutive failing frames tolerated before the frame guard halts the loop. */
const maxConsecutiveFrameErrors = 3;
/** Bounded size of the {@link Application.recentErrors} ring buffer. */
const maxRecentErrors = 20;

// User Timing mark/measure names for the per-frame loop (dev-only, see `update()`).
// Constant strings so the Performance panel groups every frame's entries
// under a stable label instead of one row per frame.
const frameStartMark = 'exojs:frame:start';
const frameMeasure = 'exojs:frame';
const systemsStartMark = 'exojs:systems:start';
const systemsMeasure = 'exojs:systems';

const createDefaultCanvas = (): HTMLCanvasElement => document.createElement('canvas');

/**
 * Upper bound for the auto-resolved device-pixel ratio. Caps the backing-store
 * blow-up on very high-density screens (e.g. DPR-3 phones would otherwise
 * allocate 9× the logical pixels → fill-rate / memory pressure and frame drops)
 * while keeping rendering crisp where it matters. Bypassed by an explicit
 * `canvas.pixelRatio` option.
 */
const maxAutoPixelRatio = 2;

/**
 * Resolve the auto device-pixel ratio used when `pixelRatio` is not specified.
 * Returns the host's `devicePixelRatio` clamped to {@link maxAutoPixelRatio}
 * (crisp on Retina/HiDPI out of the box, without a runaway fill-rate cost on
 * DPR-3 devices); falls back to `1` in non-browser / SSR / test environments.
 */
const resolveAutoPixelRatio = (): number => {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;

  return typeof dpr === 'number' && dpr > 0 ? Math.min(dpr, maxAutoPixelRatio) : 1;
};

const defaultBackendConfig: AutoBackendConfig = { type: 'auto' };
const defaultCanvasSettings = {
  width: 800,
  height: 600,
  pixelRatio: 1,
  tabIndex: -1,
} as const;
const defaultLoaderFetchOptions: RequestInit = {
  method: 'GET',
  mode: 'cors',
  cache: 'default',
};
const defaultRenderingSettings: Required<RenderingApplicationOptions> = {
  debug: false,
  spriteRendererBatchSize: 4096, // ~ 262kb
  webglAttributes: {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    stencil: false,
    depth: false,
  },
};
const defaultInputSettings: Required<InputApplicationOptions> = {
  gamepadDefinitions: [],
  gamepadSlotStrategy: 'sticky',
  pointerDistanceThreshold: 10,
};

/**
 * Top-level engine instance. Owns the canvas, render backend, scene-stack
 * controller, the core managers (input, interaction, audio, tweens,
 * rendering), the app-level {@link SystemRegistry} for user/extension
 * systems, asset loader, and the per-frame loop.
 *
 * Lifecycle: construct with options → `await app.start(scene)` → engine
 * runs the request-animation-frame loop until `app.stop()` or
 * `app.destroy()`. The render backend is chosen and initialized during
 * `start()`; query {@link Application.backend} or
 * {@link Application.capabilities} after start has resolved.
 *
 * The class exposes Signals for the major state-change points
 * ({@link Application.onResize}, {@link Application.onFrame},
 * {@link Application.onCanvasFocusChange},
 * {@link Application.onVisibilityChange},
 * {@link Application.onBackendLost}, {@link Application.onBackendRestored})
 * so subscribers can react without subclassing.
 *
 * `pauseOnHidden = true` short-circuits the per-frame work while
 * `document.hidden` is true (still consumes RAF callbacks but skips
 * scene update + render). Useful for games; leave off for tools and
 * background-active simulations.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty registry is a valid default
export class Application<Registry extends SceneRegistryShape<Registry> = {}> {
  public readonly options: ApplicationOptions<Registry>;
  public readonly canvas: HTMLCanvasElement;
  public readonly loader: Loader;
  public readonly input: InputManager;
  public readonly focus: FocusManager;
  public readonly interaction: InteractionManager;
  public readonly scenes: SceneDirector<Registry>;
  /** Per-Application seedable RNG. Isolated from other Applications and from the global `rand()`. */
  public readonly random: Random;
  public readonly tweens: TweenManager = new TweenManager();
  /**
   * App-level system registry for user/extension systems — Application
   * lifetime, independent of the active scene. The core managers (input,
   * interaction, audio, tweens, rendering) are driven directly by the
   * internal per-frame prepare stage and never occupy this registry, so any
   * `order` is available; see {@link SystemOrder} for common reference
   * points. Scene-scoped systems live on `scenes.systems`.
   */
  public readonly systems = new SystemRegistry();
  /**
   * App-scoped serializer registry, chained to the global
   * {@link defaultSerializationRegistry}. Extension serializers materialise here
   * rather than globally, so two {@link Application} instances in one process
   * keep their extension serializers isolated; core and globally-registered
   * (via `registerSerializer`) serializers remain shared through the fallback.
   */
  public readonly serializers = new SerializationRegistry(defaultSerializationRegistry);
  public readonly onResize = new Signal<[number, number, Application]>();
  public readonly onFrame = new Signal<[Time]>();
  /** Dispatched once per fixed-timestep step (zero or more times per frame), ahead of {@link onFrame}. */
  public readonly onFixedFrame = new Signal<[Time]>();
  public readonly onCanvasFocusChange = new Signal<[focused: boolean]>();
  public readonly onVisibilityChange = new Signal<[visible: boolean]>();
  public readonly onBackendLost = new Signal();
  public readonly onBackendRestored = new Signal();
  /**
   * Dispatched for every engine error: an exception thrown by any part of the
   * per-frame body (systems tick, fixed steps, scene update/draw,
   * {@link Application.onFrame} subscribers, backend flush — including
   * synchronous WebGL2 shader compile/link failures, which surface as
   * {@link RenderError}s), an asynchronous GPU error reported by the backend
   * ({@link RenderBackend.onRenderError} — WGSL compilation errors, WebGPU
   * uncaptured validation/OOM/internal errors), or a scene-unload failure in
   * {@link Application.stop}.
   *
   * The frame guard keeps the loop alive through intermittent failures and
   * halts it (status `Stopped`) after 3 consecutive failing frames. Narrow
   * with `error instanceof RenderError` for structured GPU failure details;
   * see {@link Application.recentErrors} for the bounded error history.
   */
  public readonly onError = new Signal<[error: Error]>();
  public pauseOnHidden = false;

  private readonly _updateHandler: () => void;
  private readonly _startupClock: Clock = new Clock();
  private readonly _activeClock: Clock = new Clock();
  private readonly _frameClock: Clock = new Clock();
  private readonly _fixed: FixedTimestep;
  private readonly _fixedTime: Time;
  private _frameAlpha = 0;

  private _status: ApplicationStatus = ApplicationStatus.Stopped;
  private _frameLoopActive = false;
  private _destroyed = false;
  private _pixelRatio: number = defaultCanvasSettings.pixelRatio;
  private _designWidth: number = defaultCanvasSettings.width;
  private _designHeight: number = defaultCanvasSettings.height;
  private _frameCount = 0;
  private _frameRequest = 0;
  private _backendType: 'webgl2' | 'webgpu';
  private _backend: RenderBackend;
  private _rendering: RenderingContext;
  private readonly _snapshot: ExtensionSnapshot;
  private _capabilities: Capabilities | null = null;
  private _documentVisible = true;
  private _cursor = 'default';
  private _consecutiveFrameErrors = 0;
  private readonly _recentErrors: RecentErrorEntry[] = [];
  private readonly _visibilityChangeHandler = this._onDocumentVisibilityChange.bind(this);
  private _resizeObserver: ResizeObserver | null = null;
  private _sizingMode: CanvasSizingMode = 'fixed';
  private readonly _audio: AudioManager = new AudioManager();

  public constructor(appSettings: ApplicationOptions<Registry> = {}) {
    const canvasOptions = appSettings.canvas ?? {};
    const loaderOptions = appSettings.loader ?? {};
    const renderingOptions = appSettings.rendering ?? {};
    const inputOptions = appSettings.input ?? {};
    const canvas = canvasOptions.element ?? createDefaultCanvas();

    // A wrong `canvas.element` (e.g. a <div> from a mistyped querySelector cast)
    // otherwise surfaces much later as a misleading "This browser or hardware
    // does not support WebGL." from the backend, once `canvas.getContext` turns
    // out not to be a function. Catch the real cause here instead.
    assert(
      canvas instanceof HTMLCanvasElement,
      `Application canvas.element must be an HTMLCanvasElement (got ${(canvas as object).constructor?.name ?? typeof canvas}). Pass a real <canvas> element, or omit canvas.element to let Application create one.`,
    );

    const logicalWidth = canvasOptions.width ?? defaultCanvasSettings.width;
    const logicalHeight = canvasOptions.height ?? defaultCanvasSettings.height;

    assert(logicalWidth > 0 && logicalHeight > 0, `Application canvas dimensions must be positive (got ${logicalWidth}×${logicalHeight}).`);

    this._pixelRatio = canvasOptions.pixelRatio ?? resolveAutoPixelRatio();
    this._designWidth = logicalWidth;
    this._designHeight = logicalHeight;
    this.canvas = canvas;
    this._applyCanvasSize(logicalWidth, logicalHeight);

    if (canvasOptions.tabIndex !== undefined) {
      this.canvas.tabIndex = canvasOptions.tabIndex;
    } else if (!this.canvas.hasAttribute('tabindex')) {
      this.canvas.tabIndex = defaultCanvasSettings.tabIndex;
    }

    if (canvasOptions.imageRendering !== undefined) {
      this.canvas.style.imageRendering = canvasOptions.imageRendering;
    }

    this._mountCanvas(canvasOptions.mount);
    this._sizingMode = canvasOptions.sizingMode ?? 'fixed';
    this._applySizingMode(this._sizingMode);

    this.options = {
      clearColor: appSettings.clearColor ?? Color.cornflowerBlue,
      backend: appSettings.backend ?? defaultBackendConfig,
      canvas: {
        element: this.canvas,
        width: logicalWidth,
        height: logicalHeight,
        pixelRatio: this._pixelRatio,
        tabIndex: this.canvas.tabIndex,
        ...(canvasOptions.imageRendering !== undefined && { imageRendering: canvasOptions.imageRendering }),
      },
      loader: {
        basePath: loaderOptions.basePath ?? '',
        fetchOptions: loaderOptions.fetchOptions ?? { ...defaultLoaderFetchOptions },
        ...(loaderOptions.cache !== undefined && { cache: loaderOptions.cache }),
        ...(loaderOptions.cacheStrategy !== undefined && { cacheStrategy: loaderOptions.cacheStrategy }),
        ...(loaderOptions.concurrency !== undefined && { concurrency: loaderOptions.concurrency }),
      },
      rendering: {
        debug: renderingOptions.debug ?? defaultRenderingSettings.debug,
        webglAttributes: renderingOptions.webglAttributes ?? defaultRenderingSettings.webglAttributes,
        spriteRendererBatchSize: renderingOptions.spriteRendererBatchSize ?? defaultRenderingSettings.spriteRendererBatchSize,
      },
      input: {
        gamepadDefinitions: inputOptions.gamepadDefinitions ?? [...defaultInputSettings.gamepadDefinitions],
        gamepadSlotStrategy: inputOptions.gamepadSlotStrategy ?? defaultInputSettings.gamepadSlotStrategy,
        pointerDistanceThreshold: inputOptions.pointerDistanceThreshold ?? defaultInputSettings.pointerDistanceThreshold,
      },
      hello: appSettings.hello ?? true,
      ...(appSettings.seed !== undefined && { seed: appSettings.seed }),
      ...(appSettings.fixedTimeStep !== undefined && { fixedTimeStep: appSettings.fixedTimeStep }),
    };

    // Capture extension snapshot before constructing extension-sensitive subsystems.
    this._snapshot = appSettings.extensions === undefined ? getGlobalSnapshotInternal() : buildSnapshot([...(appSettings.extensions ?? [])]);

    this.loader = new Loader(this.options.loader);

    try {
      materializeAssetBindings(this.loader, [...coreAssetBindings, ...this._snapshot.assets]);
      materializeSerializerBindings(this.serializers, this._snapshot.serializers);
    } catch (error) {
      try {
        this.loader.destroy();
      } catch {
        /* cleanup failure is secondary */
      }
      throw error;
    }

    this._backendType = this.resolveInitialBackendType();
    this._backend = this.createBackend(this._backendType, this._snapshot);
    this._rendering = new RenderingContext(this._backend);
    this.input = new InputManager(this);
    this.focus = new FocusManager(this);
    this.interaction = new InteractionManager(this);
    this.scenes = new SceneDirector<Registry>(this, appSettings.scenes);
    this.random = new Random(this.options.seed);
    this._updateHandler = this.update.bind(this);

    const fixedStepMs = this.options.fixedTimeStep !== undefined ? this.options.fixedTimeStep * 1000 : defaultFixedStepMs;

    this._fixed = new FixedTimestep(fixedStepMs, maxFixedSteps);
    this._fixedTime = new Time(fixedStepMs);

    this._startupClock.start();

    if (typeof document !== 'undefined') {
      this._documentVisible = document.visibilityState === 'visible';
      document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    }

    this.input.onCanvasFocusChange.add(focused => {
      this.onCanvasFocusChange.dispatch(focused);
    });

    this.onVisibilityChange.add(visible => {
      this._audio._applyVisibility(visible);
    });

    // Every core manager exists by this point, so app-system bindings can capture references to them.
    materializeApplicationSystems(this, this._snapshot.systems);
  }

  public get status(): ApplicationStatus {
    return this._status;
  }

  public get startupTime(): Time {
    return this._startupClock.elapsedTime;
  }

  public get activeTime(): Time {
    return this._activeClock.elapsedTime;
  }

  public get frameTime(): Time {
    return this._frameClock.elapsedTime;
  }

  public get frameCount(): number {
    return this._frameCount;
  }

  /**
   * Bounded (20 entries) list of recent engine errors, newest last. Populated
   * by the frame guard and by asynchronous backend render errors; feeds the
   * debug dump. See {@link Application.onError} for live notification.
   */
  public get recentErrors(): readonly RecentErrorEntry[] {
    return this._recentErrors;
  }

  /**
   * Interpolation factor `[0, 1)` — the leftover sub-step fraction after this
   * frame's fixed steps. Lerp rendered state between its previous and current
   * fixed-step values by this to smooth motion when the fixed rate is below the
   * frame rate.
   */
  public get frameAlpha(): number {
    return this._frameAlpha;
  }

  /** Fixed-timestep size in seconds (see {@link ApplicationOptions.fixedTimeStep}). */
  public get fixedTimeStep(): number {
    return this._fixed.stepMs / 1000;
  }

  /**
   * Low-level render backend. Prefer the high-level
   * {@link Application.rendering} render context for normal rendering.
   * Direct backend access is an escape hatch for custom render passes
   * and advanced GPU work.
   * @advanced
   */
  public get backend(): RenderBackend {
    return this._backend;
  }

  /**
   * High-level rendering context. Routes scene drawing through the
   * RenderPlan pipeline (build → optimize → play) and provides off-screen
   * capture via {@link RenderingContext.renderTo}. Exposes the raw
   * {@link RenderBackend} for advanced / custom-renderer use.
   */
  public get rendering(): RenderingContext {
    return this._rendering;
  }

  /**
   * Resolved capabilities for the host browser. Available after
   * {@link Application.start} resolves; reading before that throws.
   * For pre-start access use {@link Capabilities.ready} directly.
   */
  public get capabilities(): Capabilities {
    if (this._capabilities === null) {
      throw new Error('Application.capabilities is unavailable before start() resolves. Use `await Capabilities.ready` for pre-start checks.');
    }

    return this._capabilities;
  }

  public get canvasFocused(): boolean {
    return this.input.canvasFocused;
  }

  public get documentVisible(): boolean {
    return this._documentVisible;
  }

  public get cursor(): string {
    return this._cursor;
  }

  public set cursor(cursor: string) {
    this.setCursor(cursor);
  }

  /**
   * The active {@link CanvasSizingMode}. Assigning a new mode re-applies the
   * sizing strategy live: the previous mode's {@link ResizeObserver} (if any)
   * is disconnected and the new mode's CSS / observer is installed. Assigning
   * the current value is a no-op.
   */
  public get sizingMode(): CanvasSizingMode {
    return this._sizingMode;
  }

  public set sizingMode(mode: CanvasSizingMode) {
    if (mode === this._sizingMode) {
      return;
    }
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._sizingMode = mode;
    this._applySizingMode(mode);
  }

  /**
   * The colour the canvas is cleared to each frame, as a live {@link Color}.
   * Assigning copies into the backend's clear colour (effective next frame);
   * you may also mutate it in place via `app.clearColor.set(...)`.
   */
  public get clearColor(): Color {
    return this._backend.clearColor;
  }

  public set clearColor(color: Color) {
    this._backend.clearColor.copy(color);
  }

  public get audio(): AudioManager {
    return this._audio;
  }

  /**
   * Logical (design-space) canvas width — the value passed as `canvas.width`
   * at construction / {@link resize}, independent of {@link pixelRatio}. Use
   * this for layout math (e.g. `app.width / 2` to center) instead of
   * `app.canvas.width`, which is the physical backing-store size
   * (`app.width × app.pixelRatio`) and therefore larger on HiDPI displays.
   */
  public get width(): number {
    return this._designWidth;
  }

  /** Logical (design-space) canvas height. See {@link Application.width}. */
  public get height(): number {
    return this._designHeight;
  }

  /**
   * Device/render pixel ratio applied to the backing buffer. Defaults to the
   * host `devicePixelRatio` clamped to `2` (crisp on HiDPI out of the box, but
   * capped to avoid a runaway fill-rate cost on DPR-3 phones) unless an
   * explicit `canvas.pixelRatio` option was given. Holds the invariant
   * `app.canvas.width === Math.round(app.width × app.pixelRatio)`.
   */
  public get pixelRatio(): number {
    return this._pixelRatio;
  }

  /**
   * Convert a logical/design-space pixel coordinate — the space of
   * {@link Pointer.x}/{@link Pointer.y} and node positions, e.g. `0..app.width`
   * — to a world position using the active camera. At the default centered
   * camera this is the identity; with a panned/zoomed/rotated camera it undoes
   * the transform. Equivalent to `app.rendering.view.screenToWorld(x, y)`.
   */
  public screenToWorld(x: number, y: number): PointLike {
    return this._rendering.view.screenToWorld(x, y);
  }

  /**
   * Map a canvas backing-store pixel coordinate into design space. Because the
   * canvas always renders the full design space across its backing store (in
   * `'letterbox'` mode the canvas itself is the content area, bars excluded),
   * this is a straight backing-store → design scale. Pointer positions are
   * expressed in logical/design pixels via this mapping.
   * @internal
   */
  public _backingStoreToDesign(backingStoreX: number, backingStoreY: number): PointLike {
    const backingWidth = this.canvas.width || 1;
    const backingHeight = this.canvas.height || 1;

    return {
      x: (backingStoreX / backingWidth) * this._designWidth,
      y: (backingStoreY / backingHeight) * this._designHeight,
    };
  }

  /**
   * Initialize the render backend, await capability detection, and start the
   * per-frame loop without activating a scene. Use `start(target, data?)` to
   * start directly into a registered scene. Idempotent — if the application
   * is already running the call is a no-op. On error the status returns to
   * `Stopped` and the error propagates.
   */
  public async start(): Promise<this>;
  /**
   * Initialize the render backend, await capability detection, activate
   * `target` (a constructor registered in `ApplicationOptions.scenes`), and
   * start the per-frame loop. Idempotent — if the application is already
   * running the call is a no-op. On error the status returns to `Stopped`
   * and the error propagates.
   */
  public async start<C extends AnySceneConstructor>(target: C, ...args: ChangeSceneArgs<InferSceneData<C>>): Promise<this>;
  public async start(target?: AnySceneConstructor, ...args: readonly unknown[]): Promise<this> {
    invariant(!this._destroyed, 'Application.start() was called after destroy(). Construct a new Application instead of reusing a destroyed one.');

    if (this._status === ApplicationStatus.Stopped) {
      this._status = ApplicationStatus.Loading;

      // Kick off capability detection in parallel with renderer init — both
      // are mostly-async startup work, no point serializing them.
      const capabilitiesPromise = Capabilities.ready;

      try {
        await this.initializeBackend();

        if (this.options.hello) {
          hello({ backend: this._backendType });
        }

        // The frame loop must be live BEFORE the initial navigation runs —
        // a frame-driven SceneTransitionSession needs update()/render()
        // calls to progress, and update()'s gate no longer waits for
        // `_status === Running` (definition spec §3.7). Started as early as
        // possible (ahead of the capabilities await, not just the scene
        // nav) so nothing downstream can observe the loop live and
        // `_status` already `Running` in the same synchronous tick — a real
        // RAF callback never fires synchronously anyway, so capabilities
        // (documented as available only once `start()` resolves) is always
        // settled well before any frame body actually runs.
        this._startFrameLoop();

        // Guarantee at least one full microtask turn between the loop going
        // live and `_status` flipping to `Running` — otherwise, when
        // `capabilitiesPromise` is already settled (e.g. a later `start()`
        // call on a second Application reusing the memoized
        // `Capabilities.ready`), the two awaits below could resolve in the
        // same synchronous continuation as `_startFrameLoop()`, collapsing
        // the "loop active, not yet Running" window race-callers (a
        // frame-driven transition, tests) rely on being able to observe.
        await Promise.resolve();

        this._capabilities = await capabilitiesPromise;

        if (target !== undefined) {
          await this.scenes.change(target, ...(args as ChangeSceneArgs<InferSceneData<typeof target>>));
        }

        this._status = ApplicationStatus.Running;
      } catch (error) {
        this._status = ApplicationStatus.Stopped;
        throw error;
      }
    }

    return this;
  }

  /**
   * Flip the internal "loop is live" flag, schedule the first frame, and
   * reset every clock the frame body depends on — all in one place so every
   * call site that can start the loop does so identically. `_status` is left
   * untouched (still `Loading` at the point {@link Application.start} calls
   * this) — {@link Application.update}'s gate reads `_frameLoopActive`, a
   * strict superset of `_status === Running` (definition spec §3.7).
   */
  private _startFrameLoop(): void {
    this._frameLoopActive = true;
    this._frameRequest = requestAnimationFrame(this._updateHandler);
    this._frameClock.restart();
    this._fixed.reset();
    this._activeClock.start();
  }

  /**
   * Halt the per-frame loop: clear {@link Application._frameLoopActive},
   * cancel the pending RAF request, and stop the active/frame clocks. Called
   * from every place the loop can stop (fatal frame error, {@link
   * Application.stop}, {@link Application.destroy} during the `Loading`
   * window) so `_frameLoopActive` is the single source of truth everywhere,
   * not only where the loop starts (definition spec §3.7). Idempotent — a
   * second call while the loop is already stopped is a no-op. Deliberately
   * does NOT touch scene teardown (`scenes._clearScene()`/navigation abort)
   * — those are the caller's responsibility, since a fatal frame error must
   * NOT unload the active scene (see {@link Application._handleFrameError}'s
   * doc comment), while {@link Application.stop} explicitly does.
   */
  private _stopFrameLoop(): void {
    if (!this._frameLoopActive) {
      return;
    }

    this._frameLoopActive = false;
    cancelAnimationFrame(this._frameRequest);
    this._activeClock.stop();
    this._frameClock.stop();
  }

  /**
   * One iteration of the per-frame loop. Invoked by `requestAnimationFrame`.
   * When the document is hidden and `pauseOnHidden` is `true`, the frame
   * clock is reset and the body is skipped — preventing a large delta spike
   * on the first visible frame after resume.
   *
   * Each normal frame runs, in order:
   *
   * 1. **Internal prepare stage** (not a public phase) — input, interaction,
   *    audio, tweens, then rendering normalize their per-frame state.
   * 2. **Fixed steps** (zero or more) — `app.systems` fixed-update phase,
   *    `scenes.fixedUpdate()` + the scene's systems fixed-update phase,
   *    {@link Application.onFixedFrame}.
   * 3. **Update** — `app.systems` update phase, then `scenes.update()` + the
   *    scene's systems update phase.
   * 4. **Draw** — the scene draws (plus its systems and UI layer); an active
   *    transition session's own visual output composites either below or
   *    above the `app.systems` draw phase depending on the session's
   *    `placement` (`'scene'`: below app overlays; `'screen'`: above them,
   *    matching the pre-transition-runtime default) — see §3.6 of the
   *    scene-transition design spec.
   * 5. **Frame dispatch / flush** — {@link Application.onFrame}, backend GPU
   *    flush, frame-time stat write, RAF reschedule.
   *
   * The simulation `delta` forwarded to all update recipients is clamped to
   * an internal maximum (100 ms) so that debugger pauses, device sleep/resume,
   * or severe browser scheduling gaps cannot produce runaway animation
   * advancement. Real wall-clock time and RAF cadence are unaffected; the raw
   * elapsed delta is recorded separately in `backend.stats.rawFrameDeltaMs`.
   */
  public update(): this {
    if (this._frameLoopActive) {
      if (this.pauseOnHidden && !this._documentVisible) {
        this._frameClock.restart();
        this._fixed.reset();
        this._frameRequest = requestAnimationFrame(this._updateHandler);

        return this;
      }

      this.systems._beginFrame();
      this.scenes._beginFrame();

      // Frame guard (render-fail surface): a throwing frame is reported
      // through the error pipeline instead of killing the RAF loop; the loop
      // halts only after `maxConsecutiveFrameErrors` consecutive failures.
      try {
        const rawDeltaMs = this._frameClock.elapsedTime.milliseconds;
        const clampedDeltaMs = Math.min(rawDeltaMs, maxDeltaMs);
        const frameDelta = Time.temp.set(clampedDeltaMs);
        const frameStart = performance.now();

        if (__DEV__) Perf.mark(frameStartMark);

        this.backend.resetStats();
        this.backend.stats.rawFrameDeltaMs = rawDeltaMs;

        // Internal frame setup — not a public System phase. Same relative
        // order the core managers ticked in as (former) app systems.
        this.input._prepareFrame(frameDelta);
        this.interaction._prepareFrame(frameDelta);
        this._audio._prepareFrame(frameDelta);
        this.tweens._prepareFrame(frameDelta);
        this._rendering._prepareFrame(frameDelta);

        // Fixed-timestep steps (0..N) for deterministic logic/physics, after input
        // so they see this frame's input and before the variable update/draw.
        const fixedSteps = this._fixed.advance(clampedDeltaMs);

        for (let step = 0; step < fixedSteps; step++) {
          this.systems._fixedUpdate(this._fixedTime);
          this.scenes.fixedUpdate(this._fixedTime);
          this.onFixedFrame.dispatch(this._fixedTime);
        }

        this._frameAlpha = this._fixed.alpha;

        if (__DEV__) Perf.mark(systemsStartMark);
        this.systems._update(frameDelta);
        if (__DEV__) Perf.measure(systemsMeasure, systemsStartMark);

        this.scenes.update(frameDelta);
        this.scenes._updateTransition(frameDelta);

        if (this.scenes._transitionPlacement() === 'scene') {
          this.scenes.draw(this._rendering);
          this.scenes._renderTransition(this._rendering);
          this.systems._draw(this._rendering);
        } else {
          this.scenes.draw(this._rendering);
          this.systems._draw(this._rendering);
          this.scenes._renderTransition(this._rendering);
        }

        this.onFrame.dispatch(frameDelta);
        this.backend.flush();
        this.backend.stats.frameTimeMs = performance.now() - frameStart;

        if (__DEV__) {
          Perf.measure(frameMeasure, frameStartMark);
          Perf.clearMarks(frameStartMark);
          Perf.clearMarks(systemsStartMark);
          Perf.clearMeasures(frameMeasure);
          Perf.clearMeasures(systemsMeasure);
        }

        this._consecutiveFrameErrors = 0;
      } catch (error) {
        this._handleFrameError(error);
      } finally {
        this.scenes._endFrame();
        this.systems._endFrame();

        // RAF rescheduling always happens unless the guard halted the loop —
        // this is what keeps the canvas alive through a throwing frame.
        if (this._frameLoopActive) {
          this._frameRequest = requestAnimationFrame(this._updateHandler);
          this._frameClock.restart();
          this._frameCount++;
        }
      }
    }

    return this;
  }

  /**
   * Frame-guard error pipeline: normalize → log → ring buffer → `onError` →
   * dev banner → halt after {@link maxConsecutiveFrameErrors} consecutive
   * failing frames. Deliberately does NOT call {@link Application.stop} on
   * halt — unloading the scene could rethrow the same error.
   */
  private _handleFrameError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    this._consecutiveFrameErrors++;

    const fatal = this._consecutiveFrameErrors >= maxConsecutiveFrameErrors;

    this._reportError(normalized, fatal);

    if (fatal) {
      this._stopFrameLoop();
      this._status = ApplicationStatus.Stopped;
      logger.error(`Frame loop halted after ${maxConsecutiveFrameErrors} consecutive frame errors.`, { source: 'core', error: normalized });
    }
  }

  /**
   * Async render-error pipeline ({@link RenderBackend.onRenderError}): same
   * log + ring buffer + `onError` + banner steps as the frame guard, but no
   * consecutive-failure counting — async validation errors do not break the
   * frame loop, and the backend already deduplicates them.
   */
  private _handleAsyncRenderError(error: RenderError): void {
    // The backend already logged this at its first occurrence (and dedupes
    // repeats), so the shared pipeline must NOT log it a second time (#306).
    this._reportError(error, false, true);
  }

  /**
   * Shared error-pipeline steps: log, ring buffer, `onError`, dev banner.
   * `alreadyLogged` skips the console log for errors the backend logged at
   * source (async render errors) so they are not double-logged (#306).
   */
  private _reportError(error: Error, fatal: boolean, alreadyLogged = false): void {
    const isRenderError = error instanceof RenderError;

    if (!alreadyLogged) {
      logger.error(error.message, { source: isRenderError ? 'rendering' : 'core', error });
    }

    this._recentErrors.push({
      time: Date.now(),
      message: error.message,
      ...(isRenderError && { code: error.code }),
      ...(error.stack !== undefined && { stack: error.stack }),
    });

    if (this._recentErrors.length > maxRecentErrors) {
      this._recentErrors.shift();
    }

    this.onError.dispatch(error);

    if (__DEV__) {
      const detail = isRenderError && error.detail !== null ? `\n${error.detail}` : '';

      showDevErrorOverlay(this.canvas, `${error.message}${detail}`, { fatal });
    }
  }

  /**
   * Halt the per-frame loop, unload the active scene, and stop the active
   * + frame clocks. Leaves backend, input, audio, etc. intact — call
   * {@link Application.destroy} to release everything. Acts whenever the
   * frame loop is actually live (`_frameLoopActive`), including mid-`start()`
   * — not only while `_status` is `Running` (definition spec §3.7): a
   * transition-driven initial navigation may still be in flight, in which
   * case {@link SceneDirector._abortInFlightNavigation} (invoked internally
   * by scene teardown below) rejects it with a dedicated error rather than
   * leaving it to hang.
   */
  public stop(): this {
    if (!this._frameLoopActive) {
      return this;
    }

    if (this._status === ApplicationStatus.Running) {
      this._status = ApplicationStatus.Halting;
    }

    this._stopFrameLoop();

    void this.scenes._clearScene().catch((error: unknown) => {
      logger.error('Application.stop() failed to unload the active scene.', { source: 'Application', ...(error instanceof Error && { error }) });
      this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
    });

    this._status = ApplicationStatus.Stopped;

    return this;
  }

  /**
   * Resize the canvas and the active backend's root render target.
   * Dispatches {@link Application.onResize} after the backend has been
   * notified.
   */
  public resize(width: number, height: number): this {
    assert(width > 0 && height > 0, `Application.resize() dimensions must be positive (got ${width}×${height}).`);

    this._designWidth = width;
    this._designHeight = height;
    this._applyCanvasSize(width, height);
    this.options.canvas = {
      ...(this.options.canvas ?? {}),
      width,
      height,
      pixelRatio: this._pixelRatio,
    };

    this.backend.resize(width, height);
    this._rendering.resize(width, height);
    this.onResize.dispatch(width, height, this);

    return this;
  }

  /** Append the canvas to a mount element or CSS selector, if provided. */
  private _mountCanvas(mount?: HTMLElement | string): void {
    if (mount === undefined || typeof document === 'undefined') {
      return;
    }

    const target = typeof mount === 'string' ? document.querySelector(mount) : mount;

    if (target === null) {
      // A string selector that matches nothing is a common typo — warn instead
      // of silently leaving the canvas unattached (a beginner otherwise sees a
      // blank page with no signal as to why).
      logger.warn(
        `Application canvas.mount selector "${mount as string}" did not match any element — the canvas was created but never attached to the page. Check the selector for typos, or append \`app.canvas\` to the DOM yourself.`,
        { source: 'Application', once: `application:mount-miss:${mount as string}` },
      );

      return;
    }

    target.append(this.canvas);
  }

  /**
   * Apply the chosen {@link CanvasSizingMode}. `'fill'` observes the parent and
   * re-renders to its size; `'fit'`/`'shrink'` set CSS so the fixed-resolution
   * canvas scales to fit the parent (letterboxed via CSS object-fit);
   * `'letterbox'` observes the parent and sizes a native-resolution,
   * design-aspect canvas centered within it, the parent background showing as
   * bars. `'fixed'` is a no-op — the exact pixel size was already applied.
   */
  private _applySizingMode(mode: CanvasSizingMode): void {
    const style = this.canvas.style;

    switch (mode) {
      case 'fill': {
        const target = this.canvas.parentElement;

        if (typeof ResizeObserver === 'undefined' || !target) {
          break;
        }

        this._resizeObserver = new ResizeObserver(() => {
          const width = target.clientWidth;
          const height = target.clientHeight;

          if (width > 0 && height > 0) {
            this.resize(width, height);
          }
        });
        this._resizeObserver.observe(target);
        break;
      }
      case 'letterbox': {
        const target = this.canvas.parentElement;

        if (typeof ResizeObserver === 'undefined' || !target) {
          break;
        }

        // Center the canvas in the parent and let the parent background show as
        // letterbox bars around it.
        const parentStyle = target.style;

        parentStyle.display = 'flex';
        parentStyle.alignItems = 'center';
        parentStyle.justifyContent = 'center';
        parentStyle.overflow = 'hidden';
        parentStyle.background = '#000';

        this._resizeObserver = new ResizeObserver(() => {
          const width = target.clientWidth;
          const height = target.clientHeight;

          if (width > 0 && height > 0) {
            this._applyLetterboxLayout(width, height);
          }
        });
        this._resizeObserver.observe(target);
        break;
      }
      case 'fit':
        style.width = '100%';
        style.height = '100%';
        style.objectFit = 'contain';
        break;
      case 'shrink':
        style.maxWidth = '100%';
        style.maxHeight = '100%';
        style.objectFit = 'contain';
        break;
      case 'fixed':
      default:
        break;
    }
  }

  /**
   * Recompute the `'letterbox'` layout for a parent of the given CSS size.
   * Fits the fixed `width`×`height` design space into the parent preserving
   * aspect ratio, sizes the canvas to that content rectangle (backing store at
   * `content × pixelRatio` — always native-crisp, never upscale-blurred), and
   * lets the parent's background show through as letterbox bars around the
   * centered canvas. The render target and camera stay at the design size, so
   * the design space exactly fills the backing store (no crop, no stretch) and
   * the camera's gameplay center / zoom survive a window resize untouched.
   */
  private _applyLetterboxLayout(parentWidthCss: number, parentHeightCss: number): void {
    const layout = computeLetterboxLayout(parentWidthCss, parentHeightCss, this._designWidth, this._designHeight, this._pixelRatio);

    this.canvas.width = layout.backingWidth;
    this.canvas.height = layout.backingHeight;
    this.canvas.style.width = `${layout.contentWidthCss}px`;
    this.canvas.style.height = `${layout.contentHeightCss}px`;
  }

  /**
   * Set the canvas cursor. Strings are passed through to `canvas.style.cursor`
   * verbatim (CSS values like `'pointer'`, `'crosshair'`, or `url(...)`).
   * Image-based sources are rasterized to a `data:` URL via the shared
   * scratch canvas and used as the cursor image.
   */
  public setCursor(cursor: string | Texture | HTMLImageElement | HTMLCanvasElement): this {
    const source = cursor instanceof Texture ? cursor.source : cursor;

    if (source === null) {
      throw new Error('Provided Texture has no source.');
    }

    this._cursor = typeof source === 'string' ? source : `url(${canvasSourceToDataUrl(source)}), auto`;
    this.canvas.style.cursor = this._cursor;

    return this;
  }

  /**
   * Captures `node` into a freshly allocated off-screen {@link RenderTexture}
   * and returns it.
   *
   * Convenience wrapper that delegates to {@link RenderingContext.capture}.
   */
  public capture(node: RenderNode, options: CaptureOptions): RenderTexture {
    return this._rendering.capture(node, options);
  }

  /**
   * Tear down every owned subsystem (loader, the core managers — input,
   * interaction, audio, tweens, rendering — the app system registry, backend,
   * scene director, all clocks, all signals) and release event listeners. The
   * application instance is unusable after this call.
   */
  public destroy(): void {
    this._destroyed = true;

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
    }

    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    this.stop();
    this.loader.destroy();
    this.focus.destroy();
    this.systems.destroy();
    // Core managers are driven directly (not via `systems`, see the internal
    // prepare stage in `update()`), so they are torn down explicitly here, in
    // the same reverse order they used to run in as app systems.
    this._rendering.destroy();
    this.tweens.destroy();
    this._audio.destroy();
    this.interaction.destroy();
    this.input.destroy();
    this._backend.destroy();
    this.scenes.destroy();
    this._startupClock.destroy();
    this._activeClock.destroy();
    this._frameClock.destroy();
    this.onResize.destroy();
    this.onFrame.destroy();
    this.onFixedFrame.destroy();
    this.onCanvasFocusChange.destroy();
    this.onVisibilityChange.destroy();
    this.onBackendLost.destroy();
    this.onBackendRestored.destroy();
    this.onError.destroy();
  }

  private _onDocumentVisibilityChange(): void {
    const visible = document.visibilityState === 'visible';

    if (visible !== this._documentVisible) {
      this._documentVisible = visible;
      this.onVisibilityChange.dispatch(visible);
    }
  }

  private resolveInitialBackendType(): 'webgl2' | 'webgpu' {
    const backendType = this.options.backend?.type;

    if (backendType === 'webgl2') {
      return 'webgl2';
    }

    if (backendType === 'webgpu') {
      return 'webgpu';
    }

    return this.canUseWebGpu() ? 'webgpu' : 'webgl2';
  }

  private createBackend(backendType: 'webgl2' | 'webgpu', snapshot: ExtensionSnapshot): RenderBackend {
    const renderingOptions = this.options.rendering ?? {};
    const coreBindings = buildCoreRendererBindings(renderingOptions);
    const allBindings = [...coreBindings, ...snapshot.renderers];

    if (backendType === 'webgpu') {
      const backend = new WebGpuBackend(this);

      backend.onDeviceLost.add(() => {
        this.onBackendLost.dispatch();
      });
      backend.onDeviceRestored.add(() => {
        this.onBackendRestored.dispatch();
      });
      backend.onRenderError.add(error => {
        this._handleAsyncRenderError(error);
      });

      try {
        materializeRendererBindings(backend, allBindings);
      } catch (error) {
        try {
          backend.destroy();
        } catch {
          /* cleanup failure is secondary */
        }
        throw error;
      }

      return backend;
    }

    const backend = new WebGl2Backend(this);

    backend.onContextLost.add(() => {
      this.onBackendLost.dispatch();
    });
    backend.onContextRestored.add(() => {
      this.onBackendRestored.dispatch();
    });
    backend.onRenderError.add(error => {
      this._handleAsyncRenderError(error);
    });

    try {
      materializeRendererBindings(backend, allBindings);
    } catch (error) {
      try {
        backend.destroy();
      } catch {
        /* cleanup failure is secondary */
      }
      throw error;
    }

    return backend;
  }

  private async initializeBackend(): Promise<void> {
    try {
      await this._backend.initialize();
    } catch (error) {
      if (this.options.backend?.type !== 'auto' || this._backendType !== 'webgpu') {
        throw error;
      }

      this._backend.destroy();
      this._backendType = 'webgl2';
      this._backend = this.createBackend(this._backendType, this._snapshot);

      // Swap in a rendering context bound to the rebuilt backend. The internal
      // prepare stage reads `this._rendering` fresh every frame, so no
      // registry bookkeeping is needed here.
      const previousRendering = this._rendering;

      previousRendering.destroy();
      this._rendering = new RenderingContext(this._backend);

      await this._backend.initialize();
    }
  }

  private canUseWebGpu(): boolean {
    const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU }>;

    return !!gpuNavigator.gpu;
  }

  private _applyCanvasSize(width: number, height: number): void {
    const renderWidth = Math.round(width * this._pixelRatio);
    const renderHeight = Math.round(height * this._pixelRatio);

    this.canvas.width = renderWidth;
    this.canvas.height = renderHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
}
