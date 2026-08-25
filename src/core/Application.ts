import { AnimationManager } from '#animation/AnimationManager';
import { TweenManager } from '#animation/TweenManager';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, type LoaderOptions } from '#assets/Loader';
import { AudioManager } from '#audio/AudioManager';
import type { Extension, ExtensionDisposer } from '#extensions/Extension';
import { disposeExtensions, installExtensions } from '#extensions/lifetime';
import { materializeAssetTypes, materializeRendererBindings, materializeSerializerBindings } from '#extensions/materialize';
import { buildSnapshot, type ExtensionSnapshot } from '#extensions/snapshot';
import type { GamepadDefinition } from '#input/GamepadDefinitions';
import type { GamepadSlotStrategy } from '#input/InputManager';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { PointLike } from '#math/PointLike';
import { Random } from '#math/Random';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { OffscreenPlatform } from '#platform/OffscreenPlatform';
import type { PlatformAdapter, PlatformSubscription } from '#platform/PlatformAdapter';
import { isDomCanvas, type RenderSurface } from '#platform/RenderSurface';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderError, type RenderErrorCode } from '#rendering/RenderError';
import { type CaptureOptions, RenderingContext } from '#rendering/RenderingContext';
import { type RenderNode } from '#rendering/RenderNode';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { Capabilities } from './capabilities';
import { Clock } from './Clock';
import { Color } from './Color';
import { Connectivity } from './Connectivity';
import { DestroyScope } from './DestroyScope';
import { assert, invariant } from './dev';
import { showDevErrorOverlay } from './devErrorOverlay';
import { FixedTimestep } from './FixedTimestep';
import { hello, logger } from './logging';
import { Perf } from './Perf';
import { SceneDirector } from './SceneDirector';
import {
  type AnySceneConstructor,
  type ChangeSceneArgs,
  type InferSceneData,
  type NavigableSceneConstructor,
  type RegistryKeyOf,
  SceneNavigationAbortedError,
  type SceneRegistryShape,
} from './SceneTypes';
import { defaultSerializationRegistry, SerializationRegistry } from './serialization/SerializationRegistry';
import { Signal } from './Signal';
import type { CanvasSizing, CanvasSizingContext, CanvasSizingHostMetrics, CanvasSizingMetrics } from './sizing/CanvasSizing';
import type { System } from './System';
import { SystemOrder } from './SystemOrder';
import { SystemRegistry } from './SystemRegistry';
import { type Duration, Time } from './Time';
import { canvasSourceToDataUrl, isWebKitUserAgent } from './utils';

/**
 * Lifecycle state of an {@link Application}, in the same vocabulary
 * {@link SceneState} uses for a scene.
 *
 * | State | Meaning |
 * |---|---|
 * | `Stopped` | Constructed, or halted again - no frame loop, still reusable |
 * | `Loading` | {@link Application.start} is running: backend, scene navigation |
 * | `Running` | Frame loop live |
 * | `Halting` | {@link Application.stop} or {@link Application.destroy} is taking the loop down |
 * | `Destroying` | {@link Application.destroy}'s asynchronous teardown is in flight |
 * | `Destroyed` | Teardown finished - the instance is permanently unusable |
 *
 * `Destroying` and `Destroyed` are distinct because teardown is asynchronous:
 * `destroy()` returns a Promise, and everything between that call and its
 * fulfilment is `Destroying`. Both are terminal in the sense that
 * {@link Application.start} rejects from either.
 */
export enum ApplicationState {
  Loading = 'loading',
  Running = 'running',
  Halting = 'halting',
  Stopped = 'stopped',
  Destroying = 'destroying',
  Destroyed = 'destroyed',
}

/**
 * How the finished frame composites against the page behind the canvas.
 *
 * - `'opaque'`: the canvas has no alpha channel. Whatever is behind it in the
 *   document never shows through, no matter what alpha the frame ends on.
 * - `'premultiplied'`: the canvas keeps its alpha channel and the browser
 *   composites the frame over the page with it. Combine with a
 *   {@link ApplicationOptions.clearColor} whose alpha is below `1` to let the
 *   page show through.
 *
 * This is purely about the *browser-side* composite step. It says nothing about
 * how the engine stores or blends colour internally: ExoJS renders premultiplied
 * end to end - textures, render targets and blend modes alike - under both modes.
 */
export type CanvasAlphaMode = 'opaque' | 'premultiplied';

export interface CanvasApplicationOptions {
  /**
   * Existing surface to render into. If omitted, Application creates a canvas
   * element - and a canvas it created is also one it removes from the document
   * again in {@link Application.destroy}. A surface passed in here stays
   * yours: it is left untouched when the application goes down.
   *
   * An `OffscreenCanvas` is accepted and makes the application surface-only:
   * it has no layout box, no styling and no events, so `mount`, `tabIndex` and
   * `imageRendering` do not apply, the document-based sizing policies reject
   * it, and the host has to supply its own
   * {@link ApplicationOptions.platform} affordances for input. See
   * {@link OffscreenPlatform}.
   */
  element?: RenderSurface;
  /**
   * Base (design) resolution in logical pixels, and with it the base aspect
   * ratio. Default: 800.
   *
   * This is the resolution the application is authored against: the logical
   * coordinate system starts here, {@link CanvasApplicationOptions.sizing}
   * measures its resolution caps against it, and it is the size a canvas with
   * no sizing policy keeps for good.
   */
  width?: number;
  /** Base (design) resolution in logical pixels. See {@link CanvasApplicationOptions.width}. Default: 600. */
  height?: number;
  /**
   * Device/render pixel ratio applied to the backing buffer. Default: the
   * host `devicePixelRatio` clamped to `2` (crisp on Retina/HiDPI out of the
   * box, capped so DPR-3 phones don't pay a 9× fill-rate cost). Pass an
   * explicit value to override - e.g. `window.devicePixelRatio` for full
   * native density, or `1` to force logical-pixel rendering.
   */
  pixelRatio?: number;
  /** Canvas tabIndex. Default: -1, preserving current behavior. */
  tabIndex?: number;
  /** CSS image-rendering hint applied to the canvas style. */
  imageRendering?: 'auto' | 'pixelated' | 'crisp-edges';
  /**
   * Element (or CSS selector) to append the canvas to on construction. If
   * omitted, the canvas is created but not mounted - append it yourself.
   */
  mount?: HTMLElement | string;
  /**
   * Strategy that keeps the canvas in step with its surroundings. Omit it for a
   * canvas that stays at `width` × `height` for good, in CSS pixels and in
   * backing-store pixels alike, and observes nothing.
   *
   * The built-in policies -
   * {@link FixedResolutionCanvasSizing}, {@link CappedResolutionCanvasSizing},
   * {@link ResponsiveCanvasSizing} and {@link ManualCanvasSizing} - cover the
   * usual cases; {@link CanvasSizing} is the public base class for anything
   * else. Each instance owns its own observers, so nothing is attached for a
   * policy that tracks nothing.
   *
   * An instance belongs to one application: it is attached here and detached
   * again when {@link Application.sizing} is reassigned or the application is
   * destroyed. The document-based policies need a canvas element with a parent,
   * which for a canvas created by the engine means `mount` has to be given too.
   */
  sizing?: CanvasSizing;
}

export interface RenderingApplicationOptions {
  /**
   * How the canvas composites against the page. Default `'opaque'`. Honoured by
   * both backends: WebGL2 derives the context's `alpha`/`premultipliedAlpha`
   * from it, WebGPU its `GPUCanvasConfiguration.alphaMode`.
   *
   * @see {@link CanvasAlphaMode} for what the two modes do and do not control.
   */
  alphaMode?: CanvasAlphaMode;
  /** WebGL2-only debug wrapper. Ignored by WebGPU. */
  debug?: boolean;
  /**
   * WebGL2 context attributes. Ignored by WebGPU.
   *
   * Merged as **partial overrides on top of ExoJS's own WebGL defaults**
   * (`antialias: false`, `depth: false`, `preserveDrawingBuffer: false`) -
   * passing e.g. `{ antialias: true }` only flips that one attribute and
   * keeps the rest of ExoJS's defaults, it never replaces the whole default
   * set with the browser's own WebGL-spec defaults.
   *
   * Two attributes are not settable here because the engine owns them
   * outright and always overrides whatever is passed:
   * - `alpha` and `premultipliedAlpha` are derived from
   *   {@link RenderingApplicationOptions.alphaMode}, which is the one
   *   spelling of that contract both backends understand.
   * - `stencil` is always forced to `true` - geometric stencil clipping
   *   needs a stencil buffer on the root target unconditionally.
   */
  webglAttributes?: Omit<WebGLContextAttributes, 'alpha' | 'premultipliedAlpha' | 'stencil'>;
  /** WebGL2 sprite renderer batch size. Ignored by WebGPU. */
  spriteRendererBatchSize?: number;
}

export interface InputApplicationOptions {
  gamepadDefinitions?: GamepadDefinition[];
  gamepadSlotStrategy?: GamepadSlotStrategy;
  pointerDistanceThreshold?: number;
  /**
   * Distance in design pixels a press must travel before it turns into a drag
   * on a `draggable` node. Default `8`. Below it the press stays a click, so a
   * draggable node can still be tapped without jittering.
   */
  dragThreshold?: number;
  /**
   * Let the browser show its own context menu over the canvas. Default
   * `false` - a right-click is normally a game input, not a request for the
   * browser's menu. Independent of the engine's own `contextmenu` event,
   * which is routed through the scene graph either way.
   */
  allowNativeContextMenu?: boolean;
  /**
   * Let the browser start a text selection from a drag on the canvas. Default
   * `false` - a drag is normally a game gesture, and a stray selection
   * highlight over the canvas is almost never wanted.
   */
  allowTextSelection?: boolean;
}

export interface ApplicationOptions<Registry extends SceneRegistryShape<Registry> = {}> {
  /**
   * The colour every frame starts from. Applied by the engine's own per-frame
   * clear (see {@link ApplicationOptions.autoClear}) and readable/assignable
   * later as {@link Application.clearColor}. Default: cornflower blue.
   */
  clearColor?: Color;
  /**
   * Clear the canvas to {@link ApplicationOptions.clearColor} at the start of
   * every frame, before the scene draws. Default `true` - a scene's `draw()`
   * therefore paints onto a fresh frame and needs no clear of its own.
   *
   * Set `false` for pipelines that own the whole frame themselves: feedback /
   * trail effects that deliberately keep the previous frame, or a custom
   * renderer that issues its own clear as part of its first pass. Nothing else
   * changes - {@link Application.clearColor} is still the colour a manual
   * `context.clear(app.clearColor)` would use.
   */
  autoClear?: boolean;
  backend?: BackendConfig;
  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
  /**
   * Host seam the application runs on - surface focus and geometry, cursor,
   * touch-action, pointer capture, gamepad polling, document visibility, frame
   * scheduling, and input-event delivery. Defaults to a {@link BrowserPlatform}
   * bound to the application's canvas.
   *
   * Pass your own to host the engine somewhere other than a plain DOM canvas,
   * or to drive input and the frame loop from a test without monkey-patching
   * globals. An injected adapter is *not* destroyed by
   * {@link Application.destroy} - it stays yours to dispose.
   */
  platform?: PlatformAdapter;
  /**
   * Whether the application may reach the network, and what the host reports
   * about it. Defaults to one built over {@link ApplicationOptions.platform}.
   *
   * Pass your own when something outside the application needs the same
   * instance - a {@link ConnectivityPolicyResolver} is configured on an
   * `AssetCache` the caller builds, which happens before an `Application`
   * exists to own one. An injected `Connectivity` is *not* destroyed by
   * {@link Application.destroy} - it stays yours to dispose.
   */
  connectivity?: Connectivity;
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
   * Extension selection - the only way an Application is equipped.
   *
   * `undefined` or `[]` → Core only. `[a, b, ...]` → Core plus exactly these.
   *
   * There is no global registry to fall back on: what an application can do is
   * decided here, at its construction, and nowhere else. That is what lets two
   * Applications in one process hold different extension sets - an editor next
   * to its runtime preview, two canvases with different renderers, a test that
   * must not see what a neighbouring test installed.
   *
   * ```ts
   * import { tilemapExtension } from '@codexo/exojs-tilemap';
   *
   * const app = new Application({ extensions: [tilemapExtension] });
   * ```
   *
   * Materialised once at construction.
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
   * constructor without its own call-site `transition` option
   * - see {@link SceneRegistration}. Required for any {@link Application.start} /
   * {@link SceneDirector.change} call that targets a constructor -
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
 * One entry of the bounded {@link Application.recentErrors} ring buffer -
 * a JSON-friendly snapshot of an engine error (feeds future debug dumps).
 */
export interface RecentErrorEntry {
  /** `Date.now()` at the moment the error was recorded. */
  readonly time: number;
  readonly message: string;
  /** Machine-readable failure class - present for {@link RenderError}s. */
  readonly code?: RenderErrorCode;
  readonly stack?: string;
}

const maxDeltaMs = 100;
/** Default fixed-timestep size in milliseconds (60 Hz). */
const defaultFixedStepMs = 1000 / 60;
/** Max fixed steps run in one frame - the spiral-of-death guard. */
const maxFixedSteps = 5;
/** Consecutive failing frames tolerated before the frame guard halts the loop. */
const maxConsecutiveFrameErrors = 3;
/** Bounded size of the {@link Application.recentErrors} ring buffer. */
const maxRecentErrors = 20;
/**
 * How long {@link Application.destroy} waits for scene teardown before it
 * gives up on it and releases the rest of the engine anyway.
 *
 * A scene whose `unload()` never settles would otherwise hold the whole
 * teardown open forever - the backend, the loader and the audio context stay
 * alive with it, and the Promise `destroy()` returns never fulfils. Waiting
 * without limit turns one misbehaving scene into a leak of everything;
 * proceeding turns it into a loud, bounded failure. Scene teardown that
 * outlives the grace period keeps running, and may touch subsystems that are
 * destroyed by then - which is exactly why the timeout is reported through
 * {@link Application.onError} rather than swallowed.
 */
const sceneTeardownGraceMs = 5000;

// User Timing mark/measure names for the per-frame loop (dev-only, see `update()`).
// Constant strings so the Performance panel groups every frame's entries
// under a stable label instead of one row per frame.
const frameStartMark = 'exojs:frame:start';
const frameMeasure = 'exojs:frame';
const systemsStartMark = 'exojs:systems:start';
const systemsMeasure = 'exojs:systems';

const createDefaultCanvas = (): HTMLCanvasElement => {
  assert(
    typeof document !== 'undefined',
    'Application has no document to create a canvas in. Outside a browser window - in a worker, say - pass the surface yourself via `canvas.element` (an OffscreenCanvas transferred from the host).',
  );

  return document.createElement('canvas');
};

/** Whether `value` can be used as a {@link RenderSurface} at all. */
const isRenderSurface = (value: unknown): value is RenderSurface =>
  isDomCanvas(value as RenderSurface) || (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas);

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
  alphaMode: 'opaque',
  debug: false,
  spriteRendererBatchSize: 4096, // ~ 262kb
  webglAttributes: {
    antialias: false,
    preserveDrawingBuffer: false,
    depth: false,
  },
};
/**
 * Resolve public {@link RenderingApplicationOptions} against ExoJS's own
 * defaults. `webglAttributes` is merged as partial overrides on top of the
 * full default set (see {@link RenderingApplicationOptions.webglAttributes})
 * - everything else is a plain per-field fallback.
 *
 * @internal - shared by the constructor and by tests that need to assert on
 * the resolved options without spinning up a full {@link Application}.
 */
export const resolveRenderingOptions = (renderingOptions: RenderingApplicationOptions): Required<RenderingApplicationOptions> => ({
  alphaMode: renderingOptions.alphaMode ?? defaultRenderingSettings.alphaMode,
  debug: renderingOptions.debug ?? defaultRenderingSettings.debug,
  webglAttributes: { ...defaultRenderingSettings.webglAttributes, ...renderingOptions.webglAttributes },
  spriteRendererBatchSize: renderingOptions.spriteRendererBatchSize ?? defaultRenderingSettings.spriteRendererBatchSize,
});

const defaultInputSettings: Required<InputApplicationOptions> = {
  gamepadDefinitions: [],
  gamepadSlotStrategy: 'sticky',
  pointerDistanceThreshold: 10,
  dragThreshold: 8,
  allowNativeContextMenu: false,
  allowTextSelection: false,
};

/**
 * Top-level engine instance. Owns the canvas, render backend, scene-stack
 * controller, the core managers (input, interaction, audio, tweens,
 * animations, rendering), the app-level {@link SystemRegistry} for user/extension
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
export class Application<Registry extends SceneRegistryShape<Registry> = {}> {
  public readonly options: ApplicationOptions<Registry>;
  /**
   * The surface this application renders into - the canvas element it created
   * or was given, or an `OffscreenCanvas` it was handed. `width`/`height` are
   * the backing store in device pixels, not the CSS box; see
   * {@link Application.width} for the design size.
   *
   * Use {@link Application.element} for anything that needs the surrounding
   * document: styling, layout, or the element itself.
   */
  public readonly canvas: RenderSurface;
  /**
   * The render surface as a document canvas, or `null` when the application
   * renders into an `OffscreenCanvas` and there is no element to reach.
   */
  public readonly element: HTMLCanvasElement | null;
  /**
   * The host seam this application runs on. Every part of the engine that has
   * to reach outside its own state - input events, surface focus, cursor,
   * pointer capture, gamepads, document visibility, frame scheduling - goes
   * through this one adapter. See {@link ApplicationOptions.platform}.
   */
  public readonly platform: PlatformAdapter;
  /**
   * Whether the application may reach the network right now, and what the host
   * reports about it.
   *
   * An ordinary runtime service, not a cache detail: UI reads it for an offline
   * banner, and the asset cache reaches it only through a
   * {@link ConnectivityPolicyResolver} the application was configured with.
   */
  public readonly connectivity: Connectivity;
  public readonly loader: Loader;
  public readonly input: InputManager;
  public readonly interaction: InteractionManager;
  public readonly scenes: SceneDirector<Registry>;
  /** Per-Application seedable RNG. Isolated from other Applications and from the global `rand()`. */
  public readonly random: Random;
  public readonly tweens: TweenManager = new TweenManager();
  /**
   * Drives frame playback for every {@link AnimatedSprite} that is playing and
   * attached to this application's scene tree. Registration is automatic - see
   * {@link AnimationManager}.
   */
  public readonly animations: AnimationManager = new AnimationManager();
  /**
   * App-level system registry for user/extension systems - Application
   * lifetime, independent of the active scene. The core managers (input,
   * interaction, audio, tweens, animations, rendering) are driven directly by the
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
  /**
   * Fires whenever the canvas geometry changes, with the current logical width
   * and height - the values {@link Application.width}/{@link Application.height}
   * now report.
   *
   * Those two need not have moved: a policy that holds the logical view while
   * the display size or the render resolution follows the host still dispatches,
   * so a listener that caches something at the backing resolution has a signal
   * to rebuild on. Read `app.canvas.width`/`height` for that resolution.
   */
  public readonly onResize = new Signal<[number, number, Application]>();
  public readonly onFrame = new Signal<[Duration]>();
  /** Dispatched once per fixed-timestep step (zero or more times per frame), ahead of {@link onFrame}. */
  public readonly onFixedFrame = new Signal<[Duration]>();
  public readonly onCanvasFocusChange = new Signal<[focused: boolean]>();
  public readonly onVisibilityChange = new Signal<[visible: boolean]>();
  public readonly onBackendLost = new Signal();
  public readonly onBackendRestored = new Signal();
  /**
   * Dispatched for every engine error: an exception thrown by any part of the
   * per-frame body (systems tick, fixed steps, scene update/draw,
   * {@link Application.onFrame} subscribers, backend flush - including
   * synchronous WebGL2 shader compile/link failures, which surface as
   * {@link RenderError}s), an asynchronous GPU error reported by the backend
   * ({@link RenderBackend.onRenderError} - WGSL compilation errors, WebGPU
   * uncaptured validation/OOM/internal errors, and WebGPU device-recovery
   * exhaustion), or a scene-unload failure in {@link Application.stop}.
   *
   * The frame guard keeps the loop alive through intermittent failures and
   * halts it (state `Stopped`) after 3 consecutive failing frames. Narrow
   * with `error instanceof RenderError` for structured GPU failure details;
   * see {@link Application.recentErrors} for the bounded error history.
   */
  public readonly onError = new Signal<[error: Error]>();
  public pauseOnHidden = false;

  /**
   * The engine's own `preUpdate` systems, owned here rather than by the
   * registry. Reassigned when the backend fallback rebuilds one of them, so
   * that teardown unregisters the instances that are actually registered.
   * Starts empty rather than unassigned so that a constructor rollback, which
   * can run before the registrations happen, always finds a real list.
   */
  private _coreSystems: readonly System[] = [];

  /**
   * What every {@link Extension.install} run against this application handed
   * back, in installation order - run in reverse and emptied by
   * {@link disposeExtensions}. Field-initialised (like {@link _coreSystems})
   * so the constructor rollback, which can fire mid-installation, always finds
   * a real list holding exactly the extensions that did install.
   */
  private readonly _extensionDisposers: ExtensionDisposer[] = [];

  private readonly _updateHandler: (timestamp: number) => void;
  private readonly _startupClock: Clock;
  private readonly _activeClock: Clock;
  private readonly _frameClock: Clock;
  /**
   * Host timestamp of the frame the loop most recently began. The frame delta
   * is the distance between two of these rather than two readings taken inside
   * the callback, so a frame that starts late does not also report a short
   * delta.
   */
  private _lastFrameTimestamp = 0;
  private readonly _fixed: FixedTimestep;
  // The fixed-step duration - a true constant for the Application's whole
  // lifetime (set from `options.fixedTimeStep` in the constructor and never
  // re-`set()` afterward, unlike `_frameDelta` below). It is handed to user
  // code every fixed step via `systems._fixedUpdate`/`scenes.fixedUpdate`/
  // `onFixedFrame.dispatch`, so - same bug class as the old `Time.temp` - a
  // mutation from user code would corrupt every subsequent fixed step for
  // the rest of the app's run, not just the current one. Typed as
  // `Duration` so the mutators are not reachable on it.
  private readonly _fixedTime: Duration;
  // Scratch instance for the per-frame variable-step delta - mutated in
  // place every frame instead of allocating a Time. Owned by the frame loop
  // (not exposed publicly, unlike the old `Time.temp`), since it hands out
  // the exact object user code sees as `frameDelta`.
  private readonly _frameDelta: Time = new Time();
  private _frameAlpha = 0;

  private _state: ApplicationState = ApplicationState.Stopped;
  /**
   * The startup run that is currently in flight, or `null` while none is.
   * Held so a second {@link Application.start} call made during the `Loading`
   * window can await the same run instead of returning a resolved promise
   * while startup - including its initial scene navigation - is still going.
   */
  private _startPromise: Promise<this> | null = null;
  private _frameLoopActive = false;
  /**
   * The teardown run started by the first {@link Application.destroy} call, or
   * `null` while none is. Held so every later call returns that same Promise
   * instead of starting a second teardown over already-released subsystems.
   */
  private _destroyPromise: Promise<void> | null = null;
  private _pixelRatio: number = defaultCanvasSettings.pixelRatio;
  private _baseWidth: number = defaultCanvasSettings.width;
  private _baseHeight: number = defaultCanvasSettings.height;
  private _logicalWidth: number = defaultCanvasSettings.width;
  private _logicalHeight: number = defaultCanvasSettings.height;
  /** Last CSS box written to the canvas element, or `null` while none has been. */
  private _cssWidth: number | null = null;
  private _cssHeight: number | null = null;
  private _frameCount = 0;
  private _frameRequest = 0;
  private _backendType: 'webgl2' | 'webgpu';
  private _backend: RenderBackend;
  private _rendering: RenderingContext;
  private readonly _snapshot: ExtensionSnapshot;
  private _capabilities: Capabilities | null = null;
  private _documentVisible = true;
  /** Resolved {@link ApplicationOptions.autoClear} - read once per frame. */
  private _autoClear = true;
  private _cursor = 'default';
  private _consecutiveFrameErrors = 0;
  private readonly _recentErrors: RecentErrorEntry[] = [];
  /** Whether {@link Application.platform} was created here - an injected one is not ours to destroy. */
  private readonly _ownsPlatform: boolean;
  private readonly _ownsConnectivity: boolean;
  /**
   * Whether {@link Application.canvas} was created here. A canvas the caller
   * passed in via `canvas.element` belongs to their page - it stays in the DOM
   * when this application goes down; one the engine created does not.
   */
  private readonly _ownsCanvas: boolean;
  private _visibilitySubscription: PlatformSubscription | null = null;
  private _sizing: CanvasSizing | null = null;
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
      isRenderSurface(canvas),
      `Application canvas.element must be an HTMLCanvasElement or an OffscreenCanvas (got ${(canvas as object).constructor?.name ?? typeof canvas}). Pass a real canvas, or omit canvas.element to let Application create one.`,
    );

    const baseWidth = canvasOptions.width ?? defaultCanvasSettings.width;
    const baseHeight = canvasOptions.height ?? defaultCanvasSettings.height;

    assert(baseWidth > 0 && baseHeight > 0, `Application canvas dimensions must be positive (got ${baseWidth}×${baseHeight}).`);

    this._pixelRatio = canvasOptions.pixelRatio ?? resolveAutoPixelRatio();
    this._baseWidth = baseWidth;
    this._baseHeight = baseHeight;
    this._logicalWidth = baseWidth;
    this._logicalHeight = baseHeight;
    this._ownsCanvas = canvasOptions.element === undefined;
    this.canvas = canvas;
    this.element = isDomCanvas(canvas) ? canvas : null;
    // Ahead of the backend, which acquires its context from a surface that has
    // to carry its real backing-store size by then. The policy, if any, gets
    // its turn once there is a render target for its first commit to resize.
    this._commitMetrics(this._baseMetrics(canvasOptions.sizing === undefined));

    if (this.element !== null) {
      if (canvasOptions.tabIndex !== undefined) {
        this.element.tabIndex = canvasOptions.tabIndex;
      } else if (!this.element.hasAttribute('tabindex')) {
        this.element.tabIndex = defaultCanvasSettings.tabIndex;
      }

      if (canvasOptions.imageRendering !== undefined) {
        this.element.style.imageRendering = canvasOptions.imageRendering;
      }
    }

    // Ownership record for every subsystem built from here on. Construction is
    // the one point in the lifecycle where a half-built Application can exist:
    // if a later step throws, the caller never receives an instance and so can
    // never call `destroy()`, which leaves everything built so far with no
    // owner at all. Registration order is ownership order; the scope tears
    // down in reverse.
    //
    // Deliberately constructor-local rather than a field: the WebGPU→WebGL2
    // fallback in `initializeBackend()` destroys and replaces `_backend` and
    // `_rendering` after construction, so a retained scope would hold two
    // destroyed instances and miss the live ones. It records what construction
    // built, which is exactly as long as it is needed.
    const constructed = new DestroyScope();

    try {
      // A canvas has to be in the document before a sizing policy can measure
      // the parent it is meant to follow, so mounting comes first - and inside
      // the boundary, because a canvas the engine created is one it removes
      // again when construction fails.
      this._mountCanvas(canvasOptions.mount);

      // Established before any subsystem, because input, interaction and the
      // frame loop all read the host through it.
      this._ownsPlatform = appSettings.platform === undefined;
      this.platform = appSettings.platform ?? (this.element === null ? new OffscreenPlatform(this.canvas) : new BrowserPlatform(this.element));

      // Reads the host through the same adapter as everything else, so a
      // platform that reports no network makes the whole application agree.
      this._ownsConnectivity = appSettings.connectivity === undefined;
      this.connectivity = appSettings.connectivity ?? new Connectivity(this.platform);

      if (this._ownsConnectivity) {
        constructed.track(this.connectivity);
      }

      // Every runtime clock reads the host through the adapter, so a platform
      // with a deterministic time source makes the whole frame loop
      // deterministic - there is no second, global clock behind it.
      this._startupClock = new Clock(false, this.platform);
      this._activeClock = new Clock(false, this.platform);
      this._frameClock = new Clock(false, this.platform);

      // Only an adapter created here is ours to release - an injected one stays
      // the caller's on the failure path, exactly as in `destroy()`.
      if (this._ownsPlatform) {
        constructed.track(this.platform);
      }

      this.options = {
        clearColor: appSettings.clearColor ?? Color.cornflowerBlue,
        autoClear: appSettings.autoClear ?? true,
        backend: appSettings.backend ?? defaultBackendConfig,
        canvas: {
          element: this.canvas,
          width: baseWidth,
          height: baseHeight,
          pixelRatio: this._pixelRatio,
          ...(this.element !== null && { tabIndex: this.element.tabIndex }),
          ...(canvasOptions.imageRendering !== undefined && { imageRendering: canvasOptions.imageRendering }),
        },
        loader: {
          basePath: loaderOptions.basePath ?? '',
          fetchOptions: loaderOptions.fetchOptions ?? { ...defaultLoaderFetchOptions },
          ...(loaderOptions.cache !== undefined && { cache: loaderOptions.cache }),
          ...(loaderOptions.concurrency !== undefined && { concurrency: loaderOptions.concurrency }),
          // Always this application's own. A cache configured with a
          // `ConnectivityPolicyResolver` therefore follows `app.connectivity`
          // with no wiring by the caller, and a cache shared with a second
          // application still follows each application's own answer, because
          // what travels is a per-acquisition snapshot rather than this object.
          connectivity: this.connectivity,
        },
        rendering: resolveRenderingOptions(renderingOptions),
        input: {
          gamepadDefinitions: inputOptions.gamepadDefinitions ?? [...defaultInputSettings.gamepadDefinitions],
          gamepadSlotStrategy: inputOptions.gamepadSlotStrategy ?? defaultInputSettings.gamepadSlotStrategy,
          pointerDistanceThreshold: inputOptions.pointerDistanceThreshold ?? defaultInputSettings.pointerDistanceThreshold,
          dragThreshold: inputOptions.dragThreshold ?? defaultInputSettings.dragThreshold,
          allowNativeContextMenu: inputOptions.allowNativeContextMenu ?? defaultInputSettings.allowNativeContextMenu,
          allowTextSelection: inputOptions.allowTextSelection ?? defaultInputSettings.allowTextSelection,
        },
        hello: appSettings.hello ?? true,
        platform: this.platform,
        ...(appSettings.seed !== undefined && { seed: appSettings.seed }),
        ...(appSettings.fixedTimeStep !== undefined && { fixedTimeStep: appSettings.fixedTimeStep }),
      };

      this._autoClear = this.options.autoClear ?? true;

      // Capture extension snapshot before constructing extension-sensitive subsystems.
      this._snapshot = buildSnapshot([...(appSettings.extensions ?? [])]);

      this.loader = constructed.track(new Loader(this.options.loader));

      materializeAssetTypes(this.loader, [...coreAssetTypes, ...this._snapshot.assets]);
      materializeSerializerBindings(this.serializers, this._snapshot.serializers);

      this._backendType = this.resolveInitialBackendType();
      // `createBackend` rolls back a backend whose renderer bindings throw on
      // its own - it also runs from the post-construction backend fallback,
      // where there is no construction scope - and rethrows without assigning,
      // so that failure never reaches the scope as a tracked item.
      this._backend = constructed.track(this.createBackend(this._backendType, this._snapshot));
      this._rendering = constructed.track(new RenderingContext(this._backend));

      // After the backend, because a policy commits its first geometry as it
      // attaches and that commit resizes the root render target. Before every
      // remaining subsystem, because a policy that observes its parent holds a
      // ResizeObserver, and a DOM node holding an observer whose callback closes
      // over a half-built application is a live leak rather than an inert one.
      this._attachSizing(canvasOptions.sizing ?? null);
      this.input = constructed.track(new InputManager(this));
      this.interaction = constructed.track(new InteractionManager(this));
      this.scenes = constructed.track(new SceneDirector<Registry>(this, appSettings.scenes));
      this.random = new Random(this.options.seed);
      this._updateHandler = (timestamp: number): void => {
        this.update(timestamp);
      };

      const fixedStepMs = this.options.fixedTimeStep !== undefined ? this.options.fixedTimeStep * 1000 : defaultFixedStepMs;

      this._fixed = new FixedTimestep(fixedStepMs, maxFixedSteps);

      const fixedTime = new Time(fixedStepMs);

      // Same reasoning as the canonical constants in `Time`: `Duration` hides
      // the mutators from TypeScript, freezing catches the callers it cannot.
      if (__DEV__) {
        Object.freeze(fixedTime);
      }

      this._fixedTime = fixedTime;

      this._startupClock.start();

      this._documentVisible = this.platform.documentVisible;
      this._visibilitySubscription = this.platform.onVisibilityChange(visible => {
        this._onPlatformVisibilityChange(visible);
      });

      this.input.onCanvasFocusChange.add(focused => {
        this.onCanvasFocusChange.dispatch(focused);
      });

      this.onVisibilityChange.add(visible => {
        this._audio._applyVisibility(visible);
      });

      // The engine's own per-frame work, registered as ordinary systems in the
      // `preUpdate` phase rather than as a separate hard-coded stage. They occupy
      // the negative `order` range, so an application system added without an
      // `order` runs after all of them - and `before`/`after` can name them.
      this.systems._addCoreSystem(this.input, { order: SystemOrder.CoreInput });
      this.systems._addCoreSystem(this.interaction, { order: SystemOrder.CoreInteraction });
      this.systems._addCoreSystem(this._audio, { order: SystemOrder.CoreAudio });
      this.systems._addCoreSystem(this.tweens, { order: SystemOrder.CoreTweens });
      this.systems._addCoreSystem(this.animations, { order: SystemOrder.CoreAnimation });
      this.systems._addCoreSystem(this._rendering, { order: SystemOrder.CoreRendering });

      this._coreSystems = [this.input, this.interaction, this._audio, this.tweens, this.animations, this._rendering];

      // The last construction step, so `install(app)` sees a complete
      // application - every manager and every materialised binding already in
      // place, so an installer may add its own systems and capture references
      // to the core managers. Its mirror image is the first step of teardown,
      // in both `_disposeManagedResources` and the rollback below.
      installExtensions(this, this._snapshot.extensions, this._extensionDisposers);
    } catch (error) {
      // The caller gets no instance, so this is the only chance to release
      // what was built. The original failure is what propagates - rollback
      // never rewrites it.
      this._rollbackConstruction(constructed);

      throw error;
    }
  }

  /**
   * Release every subsystem a failed constructor had already built, and undo
   * every {@link Extension.install} that had already run. Without it, a throw
   * from any construction step - most realistically an extension's own
   * `install()`, the last one - strands the platform adapter, loader, backend, rendering context,
   * input, interaction and scene director with no owner: the caller never
   * receives an `Application` and so can never call
   * {@link Application.destroy}.
   *
   * `constructed` covers the members that may or may not exist yet, in reverse
   * construction order. The field-initialised members are handled directly:
   * they run before the constructor body and take no arguments, so they are
   * either fully built or the constructor never started - there is nothing
   * partial for a scope to track. Two more cannot be scope entries at all,
   * because neither is a `Destroyable`, and both are held from outside:
   * The sizing host's `ResizeObserver` is held by the parent DOM node it
   * observes, and {@link Application._visibilitySubscription} is a plain
   * function held by the platform adapter - which, when *injected*, is not
   * ours to destroy and would keep that subscription, and through it this
   * dead application, alive.
   *
   * One entry is only synchronous on the surface: {@link SceneDirector}'s
   * teardown is asynchronous, and `destroy()` fire-and-forgets it - a
   * constructor cannot await. In the common case that is sound here, because
   * a director reached through this path has not navigated: no active scope,
   * no retained scopes, so its teardown reduces to destroying its own
   * Signals. That is not an absolute guarantee, though: an extension's
   * `install(app)` - the last construction step, invoked with the live `app`
   * - could itself call `app.scenes.preload()` before a later extension's
   * `install` throws, leaving a preloaded scope (and its in-flight `load()`)
   * for this fire-and-forget teardown to race. It is *not* a substitute
   * for {@link Application._disposeManagedResources}, which awaits
   * `scenes._dispose()` precisely because by then there is scene state to
   * unwind before its dependencies go.
   *
   * Every step is guarded on its own, and a failing one never cancels the
   * rest. That is not defensive padding: the situation that brings us here is
   * a misbehaving extension, so a throwing `destroy()` on an extension system
   * is precisely the case to expect - and under a single `try` it would abort
   * the rollback before `constructed.destroy()` ever ran, reinstating the very
   * leak this method exists to close. It is the same contract
   * {@link DestroyScope.destroy} keeps for its own items: attempt all of
   * them, collect the failures, report at the end.
   *
   * Teardown failures are logged, never propagated: the error that aborted
   * construction is the one the caller must see, and the scope rethrows an
   * `AggregateError` in development builds, which would replace it.
   */
  private _rollbackConstruction(constructed: DestroyScope): void {
    // A binding that ran before the failing one holds a reference to this
    // half-built application. Marking it destroyed makes a later `start()` on
    // that reference fail loudly instead of running on torn-down subsystems.
    this._state = ApplicationState.Destroyed;

    const failures: unknown[] = [];
    const attempt = (step: () => void): void => {
      try {
        step();
      } catch (error) {
        failures.push(error);
      }
    };

    // Neither of these is a `Destroyable`, so neither can be a scope entry -
    // and both outlive us if left: the observer is held by a live DOM node,
    // and an injected platform adapter keeps the visibility subscription.
    attempt(() => {
      this._sizing?.detach();
      this._sizing = null;
    });
    attempt(() => {
      this._visibilitySubscription?.();
      this._visibilitySubscription = null;
    });

    // Same reasoning: the canvas may already be mounted and the parent already
    // restyled by the time a later construction step throws, and the caller
    // never gets an instance to call `destroy()` on.
    attempt(() => {
      this._releaseDom();
    });

    // Extensions that did install go first - installation is the last
    // construction step, so undoing it is the first thing rollback owes them.
    // Not wrapped in `attempt`: `disposeExtensions` guards every disposer on
    // its own and never rethrows.
    disposeExtensions(this._extensionDisposers);

    // Application systems materialised before the failure go next: they are
    // the last thing constructed before installation, and their own
    // `destroy()` may read the core managers. Those managers are registered
    // here too but are owned by the Application, so unregister them and let
    // `constructed` destroy each exactly once - same reason
    // `_disposeManagedResources` does it.
    attempt(() => {
      for (const system of [...this._coreSystems].reverse()) {
        this.systems._removeCoreSystem(system);
      }
    });

    attempt(() => this.systems.destroy());

    attempt(() => this.animations.destroy());
    attempt(() => this.tweens.destroy());
    attempt(() => this._audio.destroy());

    attempt(() => {
      constructed.destroy();
    });

    attempt(() => this._startupClock.destroy());
    attempt(() => this._activeClock.destroy());
    attempt(() => this._frameClock.destroy());
    attempt(() => this.onResize.destroy());
    attempt(() => this.onFrame.destroy());
    attempt(() => this.onFixedFrame.destroy());
    attempt(() => this.onCanvasFocusChange.destroy());
    attempt(() => this.onVisibilityChange.destroy());
    attempt(() => this.onBackendLost.destroy());
    attempt(() => this.onBackendRestored.destroy());
    attempt(() => this.onError.destroy());

    for (const failure of failures) {
      logger.error('Application construction failed, and one of the steps rolling back what it had already built failed as well.', {
        source: 'Application',
        ...(failure instanceof Error && { error: failure }),
      });
    }
  }

  /**
   * Where this application currently sits in its lifecycle. Same vocabulary
   * as {@link Scene.state} - see {@link ApplicationState} for the table.
   */
  public get state(): ApplicationState {
    return this._state;
  }

  public get startupTime(): Duration {
    return this._startupClock.elapsedTime;
  }

  public get activeTime(): Duration {
    return this._activeClock.elapsedTime;
  }

  public get frameTime(): Duration {
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
   * Interpolation factor `[0, 1)` - the leftover sub-step fraction after this
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
   * The active sizing policy, or `null` when the canvas simply stays at the
   * base resolution.
   *
   * Assigning swaps the strategy live: the outgoing policy is detached - its
   * observers released and the CSS box it wrote cleared - the canvas returns to
   * the base geometry, and only then is the new policy attached, so no remnant
   * of the previous one survives the switch. Assigning the policy that is
   * already active still detaches and re-attaches it, which is the supported
   * way to make one re-read a host it cannot observe by itself.
   *
   * The application does not take ownership: a detached policy is left intact
   * and can be attached again later.
   */
  public get sizing(): CanvasSizing | null {
    return this._sizing;
  }

  public set sizing(sizing: CanvasSizing | null) {
    this._detachSizing();
    this._sizing = sizing;
    this._applySizing();
  }

  /**
   * The colour the canvas is cleared to at the start of each frame, as a live
   * {@link Color}. Assigning copies into the backend's clear colour (effective
   * next frame); you may also mutate it in place via `app.clearColor.set(...)`.
   * The per-frame clear itself can be turned off with
   * {@link ApplicationOptions.autoClear}, which leaves this the colour a manual
   * `context.clear(app.clearColor)` uses.
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
   * Width of the logical coordinate system the application draws in - the space
   * of node positions and pointer coordinates. Use it for layout math
   * (`app.width / 2` to centre) rather than `app.canvas.width`, which is the
   * backing store in device pixels.
   *
   * Equal to the base resolution `canvas.width` unless a sizing policy derives
   * a different view from the host, which is what
   * {@link ResponsiveCanvasSizing} does. It is not the CSS size of the canvas,
   * and it is not the backing store divided by {@link pixelRatio}: all three
   * are separate axes. {@link Application.onResize} reports every change.
   */
  public get width(): number {
    return this._logicalWidth;
  }

  /** Height of the logical coordinate system. See {@link Application.width}. */
  public get height(): number {
    return this._logicalHeight;
  }

  /**
   * Device pixels per CSS pixel the backing store is scaled by. Defaults to the
   * host `devicePixelRatio` clamped to `2` - crisp on HiDPI out of the box,
   * without the fill-rate cost a DPR-3 phone would otherwise pay - unless an
   * explicit `canvas.pixelRatio` option was given.
   *
   * It converts a requested render resolution into backing-store pixels and
   * nothing else. Which render resolution is requested is the sizing policy's
   * decision, so `app.canvas.width` is `pixelRatio` times that resolution, not
   * times {@link Application.width}: the two coincide only while the logical
   * view and the render resolution are the same size.
   */
  public get pixelRatio(): number {
    return this._pixelRatio;
  }

  /**
   * Convert a logical/design-space pixel coordinate - the space of
   * {@link Pointer.x}/{@link Pointer.y} and node positions, e.g. `0..app.width`
   * - to a world position using the active camera. At the default centered
   * camera this is the identity; with a panned/zoomed/rotated camera it undoes
   * the transform. Equivalent to `app.rendering.view.screenToWorld(x, y)`.
   */
  public screenToWorld(x: number, y: number): PointLike {
    return this._rendering.view.screenToWorld(x, y);
  }

  /**
   * Map a canvas backing-store pixel coordinate into the logical coordinate
   * system. The whole logical view is always rendered across the whole backing
   * store, so this is a straight scale - and it is the mapping pointer
   * positions are expressed through, which is why they follow a policy that
   * changes the logical view without any further conversion.
   * @internal
   */
  public _backingStoreToLogical(backingStoreX: number, backingStoreY: number): PointLike {
    const backingWidth = this.canvas.width || 1;
    const backingHeight = this.canvas.height || 1;

    return {
      x: (backingStoreX / backingWidth) * this._logicalWidth,
      y: (backingStoreY / backingHeight) * this._logicalHeight,
    };
  }

  /**
   * Initialize the render backend, await capability detection, and start the
   * per-frame loop without activating a scene. Use `start(target, data?)` to
   * start directly into a registered scene. Idempotent - if the application
   * is already running the call is a no-op. On error the state returns to
   * `Stopped` and the error propagates.
   */
  public async start(): Promise<this>;
  /**
   * Initialize the render backend, await capability detection, activate
   * `target` - a registered string key, or a constructor registered in
   * `ApplicationOptions.scenes` - and start the per-frame loop. Idempotent -
   * if the application is already running the call is a no-op. On error the
   * state returns to `Stopped` and the error propagates.
   */
  public async start<K extends RegistryKeyOf<Registry>>(target: K, ...args: ChangeSceneArgs<InferSceneData<Registry[K]>>): Promise<this>;
  public async start<C extends NavigableSceneConstructor<Registry>>(target: C, ...args: ChangeSceneArgs<InferSceneData<C>>): Promise<this>;
  /**
   * Concurrency: a call made while an earlier `start()` is still in flight
   * (state `Loading`) joins that run - it resolves when startup actually
   * completes, or rejects with its failure, and its own `target`/`args` are
   * ignored rather than driving a second, overlapping scene navigation
   * ({@link SceneDirector.change} rejects on overlapping navigation). Check
   * {@link SceneDirector.currentScene} after such a call if the second
   * caller's target may differ from the one already starting.
   */
  public async start(target?: AnySceneConstructor | string, ...args: readonly unknown[]): Promise<this> {
    invariant(
      this._state !== ApplicationState.Destroying && this._state !== ApplicationState.Destroyed,
      'Application.start() was called after destroy(). Construct a new Application instead of reusing a destroyed one.',
    );

    if (this._startPromise !== null) {
      return this._startPromise;
    }

    if (this._state !== ApplicationState.Stopped) {
      return this;
    }

    this._state = ApplicationState.Loading;

    // Published before the first await so a `start()` call made from the same
    // synchronous tick - or any point in the `Loading` window - finds it. The
    // reset runs in the chained `finally`, i.e. once the run has fully settled
    // (success or failure), leaving a failed application restartable.
    const startPromise = this._runStartup(target, args).finally(() => {
      this._startPromise = null;
    });

    this._startPromise = startPromise;

    return startPromise;
  }

  /** The actual startup work behind {@link Application.start}, run at most once at a time. */
  private async _runStartup(target: AnySceneConstructor | string | undefined, args: readonly unknown[]): Promise<this> {
    // Kick off capability detection in parallel with renderer init - both
    // are mostly-async startup work, no point serializing them.
    const capabilitiesPromise = Capabilities.ready;

    try {
      await this.initializeBackend();

      if (this.options.hello) {
        hello({ backend: this._backendType });
      }

      // The frame loop must be live BEFORE the initial navigation runs -
      // a frame-driven SceneTransitionSession needs update()/render()
      // calls to progress, and update()'s gate no longer waits for
      // `_state === Running`. Started as early as
      // possible (ahead of the capabilities await, not just the scene
      // nav) so nothing downstream can observe the loop live and
      // `_state` already `Running` in the same synchronous tick - a real
      // RAF callback never fires synchronously anyway, so capabilities
      // (documented as available only once `start()` resolves) is always
      // settled well before any frame body actually runs.
      this._startFrameLoop();

      // Guarantee at least one full microtask turn between the loop going
      // live and `_state` flipping to `Running` - otherwise, when
      // `capabilitiesPromise` is already settled (e.g. a later `start()`
      // call on a second Application reusing the memoized
      // `Capabilities.ready`), the two awaits below could resolve in the
      // same synchronous continuation as `_startFrameLoop()`, collapsing
      // the "loop active, not yet Running" window race-callers (a
      // frame-driven transition, tests) rely on being able to observe.
      await Promise.resolve();

      this._capabilities = await capabilitiesPromise;

      if (target !== undefined) {
        // `target`'s implementation-level type is a union (registered key
        // OR constructor) - TS overload resolution does not distribute
        // over a union-typed argument, so the cast picks the constructor
        // overload purely for compile-time dispatch; SceneDirector.change()'s
        // own single implementation signature already accepts both shapes
        // and forwards whichever one was actually passed at runtime.
        await this.scenes.change(
          target as NavigableSceneConstructor<Registry>,
          ...(args as ChangeSceneArgs<InferSceneData<NavigableSceneConstructor<Registry>>>),
        );
      }

      this._state = ApplicationState.Running;
    } catch (error) {
      this._stopFrameLoop();
      this._state = ApplicationState.Stopped;
      throw error;
    }

    return this;
  }

  /**
   * Flip the internal "loop is live" flag, schedule the first frame, and
   * reset every clock the frame body depends on - all in one place so every
   * call site that can start the loop does so identically. `_state` is left
   * untouched (still `Loading` at the point {@link Application.start} calls
   * this) - {@link Application.update}'s gate reads `_frameLoopActive`, a
   * strict superset of `_state === Running`.
   */
  private _startFrameLoop(): void {
    this._frameLoopActive = true;
    this._frameRequest = this.platform.requestFrame(this._updateHandler);
    this._lastFrameTimestamp = this.platform.now();
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
   * not only where the loop starts. Idempotent - a
   * second call while the loop is already stopped is a no-op. Always aborts
   * whatever scene navigation is in flight via
   * {@link SceneDirector._abortInFlightNavigation} - a transition session
   * cannot progress without frame callbacks, so it must be settled here
   * rather than left to hang, regardless of caller. Deliberately does NOT
   * unload the active scene itself - a fatal frame error must NOT unload it
   * (see {@link Application._handleFrameError}'s doc comment); that decision
   * belongs to the caller, and {@link Application.stop} makes it by calling
   * {@link SceneDirector._stopAndClearActiveScene}.
   *
   * `reason` is the error the aborted navigation rejects with. `stop()` passes
   * the same instance it then hands to the stop-and-clear operation, so the
   * two are one abort with one reason rather than two competing ones.
   */
  private _stopFrameLoop(reason: Error = new SceneNavigationAbortedError()): void {
    if (!this._frameLoopActive) {
      return;
    }

    this._frameLoopActive = false;
    this.platform.cancelFrame(this._frameRequest);
    this._activeClock.stop();
    this._frameClock.stop();

    this.scenes._abortInFlightNavigation(reason);
  }

  /**
   * One iteration of the per-frame loop. Invoked by `requestAnimationFrame`.
   * When the document is hidden and `pauseOnHidden` is `true`, the frame
   * clock is reset and the body is skipped - preventing a large delta spike
   * on the first visible frame after resume.
   *
   * Each normal frame runs, in order:
   *
   * 1. **Pre-update** - `app.systems` pre-update phase, then the scene's
   *    `preUpdate()` hook and its own systems' pre-update phase. The engine's
   *    input, interaction, audio, tween, animation and rendering managers are
   *    ordinary systems in this phase, pinned to the head of it by their
   *    {@link SystemOrder} `Core*` values, so this frame's input snapshot is
   *    current before anything simulates. An application system registered
   *    without an explicit `order` runs after all of them.
   * 2. **Fixed steps** (zero or more) - `app.systems` fixed-update phase,
   *    `scenes.fixedUpdate()` + the scene's systems fixed-update phase,
   *    {@link Application.onFixedFrame}.
   * 3. **Update** - `app.systems` update phase, then `scenes.update()` + the
   *    scene's systems update phase.
   * 4. **Draw** - the canvas is cleared to {@link Application.clearColor}
   *    (unless `autoClear: false`), then the scene draws (plus its systems and UI layer); an active
   *    transition session's own visual output composites either below or
   *    above the `app.systems` draw phase depending on the session's
   *    `placement` (`'scene'`: below app overlays; `'screen'`: above them,
   *    matching the pre-transition-runtime default).
   * 5. **Frame dispatch / flush** - {@link Application.onFrame}, backend GPU
   *    flush, frame-time stat write, RAF reschedule.
   *
   * The simulation `delta` forwarded to all update recipients is clamped to
   * an internal maximum (100 ms) so that debugger pauses, device sleep/resume,
   * or severe browser scheduling gaps cannot produce runaway animation
   * advancement. Real wall-clock time and RAF cadence are unaffected; the raw
   * elapsed delta is recorded separately in `backend.stats.rawFrameDeltaMs`.
   */
  public update(timestamp: number = this.platform.now()): this {
    if (this._frameLoopActive) {
      if (this.pauseOnHidden && !this._documentVisible) {
        this._lastFrameTimestamp = timestamp;
        this._frameClock.restart();
        this._fixed.reset();
        this._frameRequest = this.platform.requestFrame(this._updateHandler);

        return this;
      }

      this.systems._beginFrame();
      this.scenes._beginFrame();

      // Frame guard (render-fail surface): a throwing frame is reported
      // through the error pipeline instead of killing the RAF loop; the loop
      // halts only after `maxConsecutiveFrameErrors` consecutive failures.
      try {
        const rawDeltaMs = Math.max(0, timestamp - this._lastFrameTimestamp);

        this._lastFrameTimestamp = timestamp;

        // Separate domain from the delta above: this one is the in-frame
        // stopwatch behind `app.frameTime`, restarted at the top of the frame
        // so a reader inside `onFrame` sees how long the frame has been
        // running rather than how long the previous one took.
        this._frameClock.restart();

        const clampedDeltaMs = Math.min(rawDeltaMs, maxDeltaMs);
        const frameDelta = this._frameDelta.set(clampedDeltaMs);
        const frameStart = this.platform.now();

        if (__DEV__) Perf.mark(frameStartMark);

        this.backend.resetStats();
        this.backend.stats.rawFrameDeltaMs = rawDeltaMs;

        // Bring per-frame state in sync before anything simulates: the engine's
        // own input, interaction, audio, tween, animation and rendering systems
        // sit at the head of this phase (negative `order`), application systems
        // follow.
        this.systems._preUpdate(frameDelta);
        this.scenes.preUpdate(frameDelta);

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

        // The frame starts from `clearColor`, so a scene's `draw()` never has to
        // open with a clear of its own. Opt out with `autoClear: false` when the
        // pipeline wants the previous frame preserved or clears it itself.
        if (this._autoClear) {
          this._rendering.clear(this.clearColor);
        }

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
        this.backend.stats.frameTimeMs = this.platform.now() - frameStart;

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

        // RAF rescheduling always happens unless the guard halted the loop -
        // this is what keeps the canvas alive through a throwing frame.
        if (this._frameLoopActive) {
          this._frameRequest = this.platform.requestFrame(this._updateHandler);
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
   * halt - unloading the scene could rethrow the same error.
   */
  private _handleFrameError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    this._consecutiveFrameErrors++;

    const fatal = this._consecutiveFrameErrors >= maxConsecutiveFrameErrors;

    this._reportError(normalized, fatal);

    if (fatal) {
      this._stopFrameLoop();
      this._state = ApplicationState.Stopped;
      logger.error(`Frame loop halted after ${maxConsecutiveFrameErrors} consecutive frame errors.`, { source: 'core', error: normalized });
    }
  }

  /**
   * Async render-error pipeline ({@link RenderBackend.onRenderError}): same
   * log + ring buffer + `onError` + banner steps as the frame guard, but no
   * consecutive-failure counting - async validation errors do not break the
   * frame loop, and the backend already deduplicates them.
   */
  private _handleAsyncRenderError(error: RenderError): void {
    // The backend already logged this at its first occurrence (and dedupes
    // repeats), so the shared pipeline must NOT log it a second time.
    this._reportError(error, false, true);
  }

  /**
   * Shared error-pipeline steps: log, ring buffer, `onError`, dev banner.
   * `alreadyLogged` skips the console log for errors the backend logged at
   * source (async render errors) so they are not double-logged.
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

      if (this.element !== null) {
        showDevErrorOverlay(this.element, `${error.message}${detail}`, { fatal });
      }
    }
  }

  /**
   * Halt the per-frame loop, unload the active scene, and stop the active
   * + frame clocks. Leaves backend, input, audio, etc. intact - call
   * {@link Application.destroy} to release everything. Acts whenever the
   * frame loop is actually live (`_frameLoopActive`), including mid-`start()`
   * - not only while `_state` is `Running`.
   *
   * A stop is allowed to interrupt a navigation - that is the point of it.
   * Everything scene-related is therefore delegated to the single
   * {@link SceneDirector._stopAndClearActiveScene} operation, which
   * invalidates the navigation generation, aborts an in-flight transition
   * session if there is one, and then unloads the
   * active scene unconditionally. Splitting that into "abort" and "clear"
   * steps is what used to let the navigation lock win the race and leave the
   * scene standing; `stop()` itself never fails with a
   * {@link ConcurrentSceneNavigationError}.
   *
   * That does not make the interrupted navigation's own lock disappear. A
   * navigation suspended in a `Scene.load()`/`init()` that never settles keeps
   * `stop()`'s interruption from ever reaching its own `catch`, so it holds
   * the director's navigation lock indefinitely - and the next
   * {@link Application.start} or {@link SceneDirector.change} after such a
   * stop rejects with {@link ConcurrentSceneNavigationError} for as long as
   * that `load()` stays pending. The stop still unloads the scene; it just
   * cannot cancel a promise the scene never resolves.
   *
   * Any scene-teardown failure the interruption did not cause - a scene's own
   * `unload()`/`destroy()` throwing - still surfaces through
   * {@link Application.onError}. Scene teardown is asynchronous and
   * fire-and-forget here: `stop()` returns as soon as the loop is halted, so
   * a scene with an async `unload()` may still be settling afterwards. A
   * subsequent {@link Application.destroy} still waits for that teardown
   * before releasing anything the scene depends on; use `destroy()` when
   * teardown ordering matters.
   */
  public stop(): this {
    if (!this._frameLoopActive) {
      return this;
    }

    if (this._state === ApplicationState.Running) {
      this._state = ApplicationState.Halting;
    }

    // One reason object for the one abort: `_stopFrameLoop()` performs it (it
    // has to - halting the loop strands a frame-driven session regardless of
    // caller), and the same instance is handed to the stop-and-clear operation
    // so the error the navigation actually rejects with is the error this call
    // site names.
    const reason = new SceneNavigationAbortedError();

    this._stopFrameLoop(reason);

    void this.scenes._stopAndClearActiveScene(reason).catch((error: unknown) => {
      logger.error('Application.stop() failed to unload the active scene.', { source: 'Application', ...(error instanceof Error && { error }) });
      this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
    });

    this._state = ApplicationState.Stopped;

    return this;
  }

  /**
   * Set a new base resolution and re-derive the canvas geometry from it.
   *
   * With no sizing policy this is the whole story: the logical view, the CSS
   * box and the backing store all move to `width` x `height` (the last one
   * times {@link pixelRatio}), and {@link Application.onResize} reports the new
   * logical size. It is also the seam an externally sized host drives through
   * under {@link ManualCanvasSizing}, where the CSS box stays the page's.
   *
   * Under a policy that tracks its surroundings the base resolution is a
   * reference rather than a result: the policy is re-attached and immediately
   * commits the geometry the host actually calls for, so the logical size that
   * ends up dispatched need not be the one passed here.
   */
  public resize(width: number, height: number): this {
    assert(width > 0 && height > 0, `Application.resize() dimensions must be positive (got ${width}×${height}).`);

    this._baseWidth = width;
    this._baseHeight = height;
    this.options.canvas = {
      ...this.options.canvas,
      width,
      height,
      pixelRatio: this._pixelRatio,
    };

    this._detachSizing();
    this._applySizing();

    return this;
  }

  /**
   * The geometry a canvas keeps when nothing is tracking its surroundings: the
   * base resolution in all three axes. `ownsCssBox` is false whenever a policy
   * is in play, so the display box is left to whoever does own it - the policy
   * itself, or the surrounding page under {@link ManualCanvasSizing}.
   */
  private _baseMetrics(ownsCssBox: boolean): CanvasSizingMetrics {
    return {
      cssWidth: ownsCssBox ? this._baseWidth : null,
      cssHeight: ownsCssBox ? this._baseHeight : null,
      logicalWidth: this._baseWidth,
      logicalHeight: this._baseHeight,
      renderWidth: this._baseWidth,
      renderHeight: this._baseHeight,
    };
  }

  /**
   * Put the canvas back on the base geometry and hand it to the active policy.
   *
   * The base commit is not redundant with what the policy is about to do: a
   * policy may decline to commit at all - a collapsed host, a manual one - and
   * the surface still has to be a valid size when it does.
   */
  private _applySizing(): void {
    this._applyMetrics(this._baseMetrics(this._sizing === null));
    this._sizing?.attach(this._createSizingContext());
  }

  /** Install `sizing` as the active policy and give it the canvas. */
  private _attachSizing(sizing: CanvasSizing | null): void {
    this._sizing = sizing;
    this._applySizing();
  }

  /**
   * Release the active policy and take back the CSS box committed under it.
   *
   * Only a box this application wrote is cleared, which is what leaves a page
   * that sizes the canvas itself - {@link ManualCanvasSizing} - holding the
   * geometry it set. And it is cleared here rather than inside the policy
   * because this is where the last committed value is remembered: a policy
   * clearing the element directly would leave that record claiming a size the
   * element no longer has, and the next policy to commit the very same size
   * would then write nothing at all. A policy stays responsible for any other
   * styling it applies itself.
   */
  private _detachSizing(): void {
    this._sizing?.detach();

    if (this._cssWidth === null) {
      return;
    }

    this._cssWidth = null;
    this._cssHeight = null;

    if (this.element !== null) {
      this.element.style.width = '';
      this.element.style.height = '';
    }
  }

  /**
   * The one channel a sizing policy changes the canvas through: commit the
   * geometry, then bring the render target and the application's own listeners
   * onto the new logical size. A commit that changes nothing stops here rather
   * than re-dispatching {@link Application.onResize}.
   */
  private _applyMetrics(metrics: CanvasSizingMetrics): void {
    if (!this._commitMetrics(metrics)) {
      return;
    }

    this.backend.resize(this._logicalWidth, this._logicalHeight);
    this._rendering.resize(this._logicalWidth, this._logicalHeight);
    this.onResize.dispatch(this._logicalWidth, this._logicalHeight, this);
  }

  /**
   * Write `metrics` onto the surface, the CSS box and the logical size, and
   * report whether anything actually moved.
   *
   * Nothing is written for a geometry that is already in place: assigning
   * `canvas.width` discards the drawing buffer even when the value is
   * unchanged, and a `ResizeObserver` fires for changes that leave the observed
   * box the size it was.
   *
   * A non-positive size in any of the three axes is ignored outright, the CSS
   * box included - a fixed-resolution policy keeps its logical and render sizes
   * whatever the host does, so a collapsed host reaches this only through the
   * display box. That is the state of a host with no layout yet, or one that
   * has collapsed, and there is no geometry to invent for it: the previous one
   * is kept until the host has a size again.
   */
  private _commitMetrics(metrics: CanvasSizingMetrics): boolean {
    if (metrics.logicalWidth <= 0 || metrics.logicalHeight <= 0 || metrics.renderWidth <= 0 || metrics.renderHeight <= 0) {
      return false;
    }

    if ((metrics.cssWidth !== null && metrics.cssWidth <= 0) || (metrics.cssHeight !== null && metrics.cssHeight <= 0)) {
      return false;
    }

    const backingWidth = Math.max(1, Math.round(metrics.renderWidth * this._pixelRatio));
    const backingHeight = Math.max(1, Math.round(metrics.renderHeight * this._pixelRatio));
    const cssChanged =
      metrics.cssWidth !== null && metrics.cssHeight !== null && (metrics.cssWidth !== this._cssWidth || metrics.cssHeight !== this._cssHeight);
    const backingChanged = backingWidth !== this.canvas.width || backingHeight !== this.canvas.height;
    const logicalChanged = metrics.logicalWidth !== this._logicalWidth || metrics.logicalHeight !== this._logicalHeight;

    if (!cssChanged && !backingChanged && !logicalChanged) {
      return false;
    }

    this._logicalWidth = metrics.logicalWidth;
    this._logicalHeight = metrics.logicalHeight;

    if (backingChanged) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }

    if (cssChanged && this.element !== null && metrics.cssWidth !== null && metrics.cssHeight !== null) {
      this._cssWidth = metrics.cssWidth;
      this._cssHeight = metrics.cssHeight;
      this.element.style.width = `${metrics.cssWidth}px`;
      this.element.style.height = `${metrics.cssHeight}px`;
    }

    return true;
  }

  /**
   * The view of this application a {@link CanvasSizing} works against.
   *
   * Rebuilt for every attach rather than kept live, which is why re-assigning
   * {@link Application.sizing} is what makes a policy re-read a host it cannot
   * observe: the base resolution and the parent element are as they were when
   * the policy took the context.
   */
  private _createSizingContext(): CanvasSizingContext {
    return {
      baseWidth: this._baseWidth,
      baseHeight: this._baseHeight,
      pixelRatio: this._pixelRatio,
      surface: this.canvas,
      element: this.element,
      host: this.element?.parentElement ?? null,
      measureHost: (): CanvasSizingHostMetrics | null => {
        const host = this.element?.parentElement ?? null;

        return host === null ? null : { width: host.clientWidth, height: host.clientHeight };
      },
      apply: (metrics: CanvasSizingMetrics): void => {
        this._applyMetrics(metrics);
      },
    };
  }

  /** Append the canvas to a mount element or CSS selector, if provided. */
  private _mountCanvas(mount?: HTMLElement | string): void {
    if (mount === undefined || typeof document === 'undefined' || this.element === null) {
      return;
    }

    const target = typeof mount === 'string' ? document.querySelector(mount) : mount;

    if (target === null) {
      // A string selector that matches nothing is a common typo - warn instead
      // of silently leaving the canvas unattached (a beginner otherwise sees a
      // blank page with no signal as to why).
      logger.warn(
        `Application canvas.mount selector "${mount as string}" did not match any element — the canvas was created but never attached to the page. Check the selector for typos, or append \`app.element\` to the DOM yourself.`,
        { source: 'Application', once: `application:mount-miss:${mount as string}` },
      );

      return;
    }

    target.append(this.element);
  }

  /**
   * Set the surface cursor. Strings are passed through to the platform
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
    this.platform.setCursor(this._cursor);

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
   * Tear down every owned subsystem (loader, the core managers - input,
   * interaction, audio, tweens, animations, rendering - the app system registry, backend,
   * scene director, all clocks, all signals) and release event listeners. The
   * application instance is unusable after this call.
   *
   * The page is left as it was found: the active sizing policy is detached, so
   * its observers go and the CSS box it wrote is cleared, and a canvas the
   * engine created itself is removed from the document. A canvas supplied
   * through `canvas.element` belongs to the caller and stays in place, as does
   * every element around it - no sizing policy ever styles the page itself.
   *
   * Fires the RAF halt synchronously (so no further frame runs after this
   * call returns) and returns a Promise that fulfils once the rest of teardown
   * has run: `scenes` - including every retained and preloaded scope, and any
   * scene's own async `unload()` - is fully disposed FIRST, before the Loader,
   * rendering context, audio manager, or backend are destroyed, so a scene's
   * teardown code never touches an already-destroyed dependency. This
   * intentionally does not route through the public {@link Application.stop},
   * which fire-and-forgets its own scene-clear - that would race against
   * `scenes._dispose()`'s own active-scope teardown for ownership of the same
   * scope. `destroy()` instead halts the frame loop directly and lets
   * `scenes._dispose()` own scene teardown entirely.
   *
   * `destroy()` called right after a `stop()` is covered by the same
   * guarantee, not an exception to it: the scene teardown `stop()` fired and
   * did not await is published on the director, and `scenes._dispose()` waits
   * for it - including a still-pending `Scene.unload()` - before any
   * dependency is destroyed.
   *
   * Every extension goes down with the application: the disposers
   * {@link Extension.install} returned run in reverse installation order,
   * after scene teardown and before any subsystem they might still reach for
   * is released. An extension's lifetime is exactly this application's - there
   * is no uninstall short of it.
   *
   * The returned Promise **never rejects**: teardown failures go to
   * {@link Application.onError} and the log, exactly as they did when this was
   * a fire-and-forget chain, and the remaining stages still run. Awaiting it
   * therefore means "teardown is over", not "teardown succeeded" - which is
   * what a caller reusing the canvas or asserting on released resources needs.
   *
   * Scene teardown is bounded: if `scenes._dispose()` has not settled within
   * the grace period the engine reports a timeout and releases everything else
   * anyway, rather than leaving the whole application pinned by one scene whose
   * `unload()` never resolves. A scene that wants to cooperate with this should
   * watch {@link Scene.lifecycleSignal}, which is aborted when its teardown
   * begins.
   *
   * Idempotent: every call after the first returns the same Promise as the
   * first and starts no second teardown. {@link Application.state} is
   * `Destroying` while the returned Promise is pending and `Destroyed`
   * afterwards.
   */
  public destroy(): Promise<void> {
    if (this._destroyPromise !== null) {
      return this._destroyPromise;
    }

    this._visibilitySubscription?.();
    this._visibilitySubscription = null;
    // Detached rather than released through `_detachSizing`: the canvas shows a
    // frozen last frame from here on, and collapsing its display box out from
    // under that is a visible artefact. What has to go is the observation.
    this._sizing?.detach();
    this._sizing = null;
    this._releaseDom();

    if (this._frameLoopActive) {
      if (this._state === ApplicationState.Running) {
        this._state = ApplicationState.Halting;
      }

      this._stopFrameLoop();
    }

    this._state = ApplicationState.Destroying;

    this._destroyPromise = this._disposeManagedResources()
      .catch((error: unknown) => {
        logger.error('Application.destroy() failed during teardown.', { source: 'Application', ...(error instanceof Error && { error }) });
        this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
      })
      .then(() => {
        this._state = ApplicationState.Destroyed;
      });

    return this._destroyPromise;
  }

  /**
   * Hand the page back what it lent us: a canvas the engine created itself
   * leaves the document. A canvas passed in through `canvas.element` is the
   * caller's element and stays exactly where they put it - removing it would
   * delete part of their page. The element the caller keeps carries no styling
   * of ours either; that is released with the sizing policy that wrote it.
   *
   * Synchronous and part of `destroy()`'s immediate half rather than the async
   * teardown chain: once the frame loop is halted the canvas shows a frozen
   * last frame, and leaving that visible until an async scene `unload()`
   * settles is a visible artefact, not an implementation detail.
   */
  private _releaseDom(): void {
    if (this._ownsCanvas) {
      this.element?.remove();
    }
  }

  /**
   * @internal Awaited teardown, in order: `scenes` fully disposed first
   * (active + every retained + every preloaded scope, plus any teardown a
   * fire-and-forget {@link Application.stop} left running, including each
   * one's own async `unload()`) - then the extension disposers, in reverse
   * installation order - then every other owned subsystem, then clocks, then
   * Signals. See {@link Application.destroy}'s doc comment for why scenes go
   * first.
   */
  private async _disposeManagedResources(): Promise<void> {
    try {
      await this._disposeScenesWithinGrace();
    } catch (error) {
      logger.error('Application.destroy() failed to fully dispose SceneDirector.', { source: 'Application', ...(error instanceof Error && { error }) });
    }

    // Extensions installed last, so they are undone first - while the loader,
    // backend, audio and their own systems are all still alive for a disposer
    // to unhook from. Scenes go ahead of even this, because a scene may hold
    // whatever an extension installed.
    disposeExtensions(this._extensionDisposers);

    this.loader.destroy();

    // The core managers run as systems but belong to the application, not to
    // the registry - which destroys whatever is still registered when it goes
    // down. Unregister them first so they are torn down exactly once, here, in
    // reverse registration order.
    for (const system of [...this._coreSystems].reverse()) {
      this.systems._removeCoreSystem(system);
    }

    this.systems.destroy();

    this._rendering.destroy();
    this.animations.destroy();
    this.tweens.destroy();
    this._audio.destroy();
    this.interaction.destroy();
    this.input.destroy();
    this._backend.destroy();

    // Only what this application created is ours to tear down; an injected
    // adapter or connectivity may outlive us or be shared.
    if (this._ownsConnectivity) {
      this.connectivity.destroy();
    }

    if (this._ownsPlatform) {
      this.platform.destroy();
    }

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

  /**
   * Await scene teardown, but not indefinitely: {@link sceneTeardownGraceMs}
   * after the wait starts the engine stops waiting, reports the timeout
   * through the normal error pipeline and lets the rest of teardown proceed.
   *
   * The abandoned teardown is not cancelled - nothing here can cancel a
   * Promise a scene never settles. It keeps running against subsystems this
   * method is about to destroy, which is a worse outcome than a clean
   * shutdown and a better one than an application that never goes down at
   * all. The error names the scene teardown as the cause so the report points
   * at the `unload()` that hung rather than at whatever fails downstream of
   * it.
   */
  private async _disposeScenesWithinGrace(): Promise<void> {
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const grace = new Promise<'timeout'>(resolve => {
      graceTimer = setTimeout(() => resolve('timeout'), sceneTeardownGraceMs);
    });

    try {
      const outcome = await Promise.race([this.scenes._dispose(), grace]);

      if (outcome === 'timeout') {
        const error = new Error(
          `Application.destroy() gave up waiting for scene teardown after ${sceneTeardownGraceMs} ms and released the rest of the engine anyway. A Scene.unload() is most likely never settling — watch Scene.lifecycleSignal and resolve when it aborts.`,
        );

        logger.error(error.message, { source: 'Application', error });
        this.onError.dispatch(error);
      }
    } finally {
      clearTimeout(graceTimer);
    }
  }

  private _onPlatformVisibilityChange(visible: boolean): void {
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

      // Swap in a rendering context bound to the rebuilt backend. Everything
      // holding the outgoing context has to be repointed, not just the field:
      // the registry drives the systems it was handed at registration time,
      // so leaving the old entry in place would tick a destroyed context every
      // frame and never the live one.
      const previousRendering = this._rendering;

      this.systems._removeCoreSystem(previousRendering);
      previousRendering.destroy();
      this._rendering = new RenderingContext(this._backend);
      this.systems._addCoreSystem(this._rendering, { order: SystemOrder.CoreRendering });
      this._coreSystems = this._coreSystems.map(system => (system === previousRendering ? this._rendering : system));

      // A backend sizes its root target from the base resolution, which is not
      // where a sizing policy may have taken the logical view by now - and the
      // surface it is about to configure already carries that policy's backing
      // store.
      this._backend.resize(this._logicalWidth, this._logicalHeight);
      this._rendering.resize(this._logicalWidth, this._logicalHeight);

      await this._backend.initialize();
    }
  }

  /**
   * Whether `backend: 'auto'` should pick WebGPU. Presence of `navigator.gpu`
   * is necessary but not sufficient: WebKit ships a WebGPU implementation that
   * renders this engine incorrectly - SDF text draws as an empty frame, and
   * repeated runs of the parity matrix fail a different set of scenes each
   * time, which points at the driver rather than at engine code. Neither has a
   * feature flag to test, and both produce a broken picture with no error, so
   * `auto` keeps WebKit on WebGL2, where the same scenes render correctly.
   *
   * This is not a permanent verdict. `backend: 'webgpu'` still selects it
   * explicitly for anyone testing WebKit's implementation, and the check should
   * go once the parity matrix comes back clean there.
   */
  private canUseWebGpu(): boolean {
    const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU }>;

    return !!gpuNavigator.gpu && !isWebKitUserAgent(navigator.userAgent);
  }
}
