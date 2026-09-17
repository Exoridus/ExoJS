import { AnimationSystem } from '#animation/AnimationSystem';
import { TweenSystem } from '#animation/TweenSystem';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { AudioSystem } from '#audio/AudioSystem';
import { ApplicationErrorReporter, maxConsecutiveFrameErrors, type RecentErrorEntry } from '#core/application/ApplicationErrorReporter';
import {
  type ApplicationOptions,
  defaultBackendConfig,
  defaultCanvasSettings,
  defaultInputSettings,
  defaultLoaderFetchOptions,
  resolveRenderingOptions,
} from '#core/application/ApplicationOptions';
import { ApplicationSizing } from '#core/application/ApplicationSizing';
import { type BackendType, createBackend, resolveBackendType } from '#core/application/backendSelection';
import { onAppInitialized } from '#core/application/devHooks';
import { defaultFixedStepMs, FrameLoop } from '#core/application/FrameLoop';
import { createDefaultCanvas, isRenderSurface } from '#core/applicationCanvas';
import { CoroutineSystem } from '#core/CoroutineSystem';
import { SceneDirector } from '#core/scene/SceneDirector';
import { SceneNavigationAbortedError } from '#core/scene/sceneErrors';
import {
  type AnySceneConstructor,
  type ChangeSceneArgs,
  type InferSceneData,
  type NavigableSceneConstructor,
  type RegistryKeyOf,
  type SceneRegistryShape,
} from '#core/scene/sceneTypes';
import { defaultSerializationRegistry, SerializationRegistry } from '#core/serialization/SerializationRegistry';
import type { CanvasSizing } from '#core/sizing/CanvasSizing';
import type { Extension, ExtensionDisposer } from '#extensions/Extension';
import type { RendererBinding } from '#extensions/Extension';
import { disposeExtensions, installExtensions } from '#extensions/lifetime';
import { materializeAssetTypes, materializeSerializerBindings } from '#extensions/materialize';
import { buildSnapshot, type ExtensionSnapshot } from '#extensions/snapshot';
import { InputSystem } from '#input/InputSystem';
import { InteractionSystem } from '#input/InteractionSystem';
import type { PointLike } from '#math/PointLike';
import { Random } from '#math/Random';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { OffscreenPlatform } from '#platform/OffscreenPlatform';
import type { PlatformAdapter, PlatformSubscription } from '#platform/PlatformAdapter';
import { isDomCanvas, type RenderSurface } from '#platform/RenderSurface';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RenderBackend } from '#rendering/RenderBackend';
import { type CaptureOptions, RenderingContext } from '#rendering/RenderingContext';
import { type RenderNode } from '#rendering/RenderNode';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';

import { Capabilities } from './Capabilities';
import { Color } from './Color';
import { Connectivity } from './Connectivity';
import { DestroyScope } from './DestroyScope';
import { assert, invariant } from './dev';
import type { FrameBudget } from './FrameBudget';
import { hello, logger } from './Logger';
import { detachedNodeDirtyIndex, NodeDirtyIndex } from './nodeDirtyIndex';
import { Perf } from './Perf';
import { Signal } from './Signal';
import type { System } from './System';
import { SystemOrder } from './SystemOrder';
import { SystemRegistry } from './SystemRegistry';
import { type Seconds, seconds } from './units';
import { canvasSourceToDataUrl } from './utils';

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

/**
 * Top-level engine instance. Owns the canvas, render backend, scene-stack
 * controller, the core systems (input, interaction, audio, coroutines, tweens,
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
 *
 * **Several applications on one page** are a supported shape, and each owns its
 * surface, backend, scene stack, core systems, extension set, asset loader,
 * frame loop, RNG and changed-record index. Two applications therefore neither
 * rotate each other's retained-plan window nor make each other's scene
 * mutations record anything.
 *
 * What they do share is the process: the Web Audio context (deliberately, since
 * a browser admits only a few) and the monotonic revision counters the scene
 * graph stamps nodes with, which advance faster with a second application but
 * are only ever compared per node. A scene node belongs to exactly one
 * application at a time, and moving one across is an ordinary reparent - its
 * retained state travels with it.
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
  public readonly input: InputSystem;
  public readonly interaction: InteractionSystem;
  public readonly scenes: SceneDirector<Registry>;
  /**
   * @internal - this application's changed-record index, reached by its scene
   * nodes through the {@link Stage} and by their retained consumers through the
   * nodes they answer for.
   *
   * Per-Application rather than per-process: the window counts in frames, so a
   * second application sharing it would rotate every consumer's cursor out at
   * twice the rate, and a retained consumer in one application would arm the
   * mutation seam for every node in the other.
   */
  public readonly _dirtyIndex: NodeDirtyIndex = new NodeDirtyIndex();
  /** Per-Application seedable RNG. Isolated from other Applications and from the global `rand()`. */
  public readonly random: Random;
  public readonly tweens: TweenSystem = new TweenSystem();
  /**
   * Frame-budgeted driver for generator coroutines (world generation, batch
   * pathfinding, anything too heavy for one frame). Runs in the `postFrame`
   * phase on a share of what the frame has left; see {@link CoroutineSystem}.
   */
  public readonly coroutines: CoroutineSystem = new CoroutineSystem({ order: SystemOrder.CoreCoroutines });
  /**
   * Drives frame playback for every {@link AnimatedSprite} that is playing and
   * attached to this application's scene tree. Registration is automatic - see
   * {@link AnimationSystem}.
   */
  public readonly animations: AnimationSystem = new AnimationSystem();
  /**
   * App-level system registry for user/extension systems - Application
   * lifetime, independent of the active scene. The core systems (input,
   * interaction, audio, coroutines, tweens, animations, rendering) are driven directly by the
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
  public readonly onFrame = new Signal<[Seconds]>();
  /** Dispatched once per fixed-timestep step (zero or more times per frame), ahead of {@link onFrame}. */
  public readonly onFixedFrame = new Signal<[Seconds]>();
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
   * The engine's own `preFrame` systems, owned here rather than by the
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

  private readonly _scheduler: FrameLoop;

  /**
   * Host timestamp the running frame body started at, and whether one is
   * running at all. Both back {@link Application._frameBudget}, which reports
   * zero outside a frame rather than a figure derived from a stale start.
   */
  private _frameStart = 0;
  private _inFrame = false;

  /**
   * The single {@link FrameBudget} handed to every `postFrame` system, updated
   * in place rather than rebuilt - a system may hold it across frames, and the
   * frame path allocates nothing.
   */
  private readonly _frameBudget: FrameBudget = {
    timeRemaining: (): Seconds => {
      if (!this._inFrame) {
        return seconds(0);
      }

      return seconds(Math.max(0, this._scheduler.displayFrameSeconds * 1000 - (this.platform.now() - this._frameStart)) / 1000);
    },
  };

  private _state: ApplicationState = ApplicationState.Stopped;
  /**
   * The startup run that is currently in flight, or `null` while none is.
   * Held so a second {@link Application.start} call made during the `Loading`
   * window can await the same run instead of returning a resolved promise
   * while startup - including its initial scene navigation - is still going.
   */
  private _startPromise: Promise<this> | null = null;
  /**
   * The teardown run started by the first {@link Application.destroy} call, or
   * `null` while none is. Held so every later call returns that same Promise
   * instead of starting a second teardown over already-released subsystems.
   */
  private _destroyPromise: Promise<void> | null = null;
  private _backendType: 'webgl2' | 'webgpu';
  private _backend: RenderBackend;
  private _rendering: RenderingContext;
  private readonly _snapshot: ExtensionSnapshot;
  private _capabilities: Capabilities | null = null;
  private _documentVisible = true;
  /** Resolved {@link ApplicationOptions.autoClear} - read once per frame. */
  private _autoClear = true;
  /**
   * The frame pass pipeline and the target the frame is drawn into while it
   * holds passes. Both are built on first access rather than in the
   * constructor: an application that never post-processes its frame must not
   * carry a screen-sized render texture for the possibility.
   */
  private _framePasses: RenderPipeline | null = null;
  private _frameTexture: RenderTexture | null = null;
  private _frameRedirect: BackendTargetPass | null = null;
  private _cursor = 'default';
  private readonly _errors: ApplicationErrorReporter;
  /** Whether {@link onAppInitialized} has already announced this application. */
  private _announced = false;
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
  private _geometry!: ApplicationSizing;
  private readonly _audio: AudioSystem = new AudioSystem();

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

    this._ownsCanvas = canvasOptions.element === undefined;
    this.canvas = canvas;
    this.element = isDomCanvas(canvas) ? canvas : null;
    this._errors = new ApplicationErrorReporter(this.onError, this.element);
    // Ahead of the backend, which acquires its context from a surface that has
    // to carry its real backing-store size by then. The commit sink stays inert
    // until there is a render target for it to resize; the policy, if any, gets
    // its turn once there is.
    this._geometry = new ApplicationSizing(this.canvas, this.element, {
      baseWidth,
      baseHeight,
      pixelRatio: canvasOptions.pixelRatio,
      hasPolicy: canvasOptions.sizing !== undefined,
      hooks: {
        onCommit: (logicalWidth, logicalHeight) => {
          this._onGeometryCommit(logicalWidth, logicalHeight);
        },
        onPixelRatioChange: () => {
          this.resize(this._geometry.baseWidth, this._geometry.baseHeight);
        },
      },
    });

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
      this._scheduler = new FrameLoop(
        this.platform,
        timestamp => {
          this.update(timestamp);
        },
        appSettings.fixedTimeStep !== undefined ? appSettings.fixedTimeStep * 1000 : defaultFixedStepMs,
        appSettings.displayFrameTime !== undefined ? seconds(appSettings.displayFrameTime) : undefined,
      );

      // Only an adapter created here is ours to release - an injected one stays
      // the caller's on the failure path, exactly as in `destroy()`.
      if (this._ownsPlatform) {
        constructed.track(this.platform);
      }

      this.options = {
        clearColor: appSettings.clearColor ?? Color.black,
        autoClear: appSettings.autoClear ?? true,
        backend: appSettings.backend ?? defaultBackendConfig,
        canvas: {
          element: this.canvas,
          width: baseWidth,
          height: baseHeight,
          pixelRatio: this._geometry.pixelRatio,
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
        ...(appSettings.displayFrameTime !== undefined && { displayFrameTime: appSettings.displayFrameTime }),
      };

      this._autoClear = this.options.autoClear ?? true;

      // Capture extension snapshot before constructing extension-sensitive subsystems.
      this._snapshot = buildSnapshot([...(appSettings.extensions ?? [])]);

      this.loader = constructed.track(new Loader(this.options.loader));

      materializeAssetTypes(this.loader, [...coreAssetTypes, ...this._snapshot.assets]);
      materializeSerializerBindings(this.serializers, this._snapshot.serializers);

      this._backendType = resolveBackendType(this.options.backend);
      // `createBackend` rolls back a backend whose renderer bindings throw on
      // its own - it also runs from the post-construction backend fallback,
      // where there is no construction scope - and rethrows without assigning,
      // so that failure never reaches the scope as a tracked item.
      this._backend = constructed.track(this._createBackend(this._backendType));
      this._rendering = constructed.track(new RenderingContext(this._backend));

      // After the backend, because a policy commits its first geometry as it
      // attaches and that commit resizes the root render target. Before every
      // remaining subsystem, because a policy that observes its parent holds a
      // ResizeObserver, and a DOM node holding an observer whose callback closes
      // over a half-built application is a live leak rather than an inert one.
      this._geometry.attachPolicy(canvasOptions.sizing ?? null);
      this._geometry.watchPixelRatio(this.platform);
      this.input = constructed.track(new InputSystem(this));
      this.interaction = constructed.track(new InteractionSystem(this));
      this.scenes = constructed.track(new SceneDirector<Registry>(this, appSettings.scenes));
      this.random = new Random(this.options.seed);
      this._scheduler.startStartupClock();

      // The default coroutine `minSlice` is a fraction of the display cadence,
      // which only the frame loop knows and which changes as the loop observes
      // it - so the system reads it rather than being handed a number once.
      this.coroutines._bindFrameTarget(() => this._scheduler.displayFrameSeconds);

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

      // The engine's own per-frame work, registered as ordinary systems rather
      // than as separate hard-coded stages - `preFrame` for all of them except
      // the coroutine driver, which belongs after the flush. They occupy the
      // negative `order` range, so an application system added without an
      // `order` runs after all of them - and `before`/`after` can name them.
      this.systems._addCoreSystem(this.input, { order: SystemOrder.CoreInput });
      this.systems._addCoreSystem(this.interaction, { order: SystemOrder.CoreInteraction });
      this.systems._addCoreSystem(this._audio, { order: SystemOrder.CoreAudio });
      this.systems._addCoreSystem(this.coroutines, { order: SystemOrder.CoreCoroutines });
      this.systems._addCoreSystem(this.tweens, { order: SystemOrder.CoreTweens });
      this.systems._addCoreSystem(this.animations, { order: SystemOrder.CoreAnimation });
      this.systems._addCoreSystem(this._rendering, { order: SystemOrder.CoreRendering });

      this._coreSystems = [this.input, this.interaction, this._audio, this.coroutines, this.tweens, this.animations, this._rendering];

      // The last construction step, so `install(app)` sees a complete
      // application - every system and every materialised binding already in
      // place, so an installer may add its own systems and capture references
      // to the core systems. Its mirror image is the first step of teardown,
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
    this._setState(ApplicationState.Destroyed);

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
      this._geometry.detachPolicy();
    });
    attempt(() => {
      this._releasePlatformSubscriptions();
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
    // `destroy()` may read the core systems. Those systems are registered
    // here too but are owned by the Application, so unregister them and let
    // `constructed` destroy each exactly once - same reason
    // `_disposeManagedResources` does it.
    attempt(() => {
      for (const system of [...this._coreSystems].reverse()) {
        this.systems._removeCoreSystem(system);
      }
    });

    attempt(() => this.systems.destroy());

    attempt(() => this._releaseFramePasses());

    attempt(() => this.animations.destroy());
    attempt(() => this.tweens.destroy());
    attempt(() => this.coroutines.destroy());
    attempt(() => this._audio.destroy());

    attempt(() => {
      constructed.destroy();
    });

    attempt(() => this._scheduler.destroy());
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

  /**
   * The single writer for {@link Application._state}. `Destroying` and
   * `Destroyed` are terminal: the only transition out of them is
   * `Destroying` -> `Destroyed`. Startup runs settle asynchronously and their
   * failure path resets the state to `Stopped`, so without this a `start()`
   * whose navigation was rejected by teardown's own abort would land after
   * the teardown chain and resurrect a destroyed instance - `state` would
   * report `Stopped` and `start()` would reinitialize a destroyed backend.
   */
  private _setState(next: ApplicationState): void {
    const terminal = this._state === ApplicationState.Destroyed || (this._state === ApplicationState.Destroying && next !== ApplicationState.Destroyed);

    if (!terminal) this._state = next;
  }

  public get startupSeconds(): Seconds {
    return this._scheduler.startupSeconds;
  }

  public get activeSeconds(): Seconds {
    return this._scheduler.activeSeconds;
  }

  public get frameSeconds(): Seconds {
    return this._scheduler.frameSeconds;
  }

  public get frameCount(): number {
    return this._scheduler.frameCount;
  }

  /**
   * Bounded (20 entries) list of recent engine errors, newest last. Populated
   * by the frame guard and by asynchronous backend render errors; feeds the
   * debug dump. See {@link Application.onError} for live notification.
   */
  public get recentErrors(): readonly RecentErrorEntry[] {
    return this._errors.recent;
  }

  /**
   * Interpolation factor `[0, 1)` - the leftover sub-step fraction after this
   * frame's fixed steps. Lerp rendered state between its previous and current
   * fixed-step values by this to smooth motion when the fixed rate is below the
   * frame rate.
   */
  public get frameAlpha(): number {
    return this._scheduler.alpha;
  }

  /** Fixed-timestep size in seconds (see {@link ApplicationOptions.fixedTimeStep}). */
  public get fixedTimeStep(): number {
    return this._scheduler.stepMs / 1000;
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
   * Passes that run after the frame has been drawn, with the frame itself as
   * their input - the seam for a screen-wide effect (bloom over everything, a
   * deferred lighting composite, a CRT filter) that a per-node filter cannot
   * express.
   *
   * While this pipeline holds at least one pass, the scene, the systems' draw
   * hooks and any scene transition render into {@link Application.frameTexture}
   * instead of the canvas, and the pipeline is played afterwards; the last pass
   * to write the active target produces the picture. An empty pipeline is the
   * frame as it is drawn without this feature, at no cost.
   *
   * ```ts
   * app.framePasses.addPass(new FilterPass(app.frameTexture, [new BloomFilter()]));
   * ```
   *
   * Owned by the application: its passes are destroyed with it. Remove a pass
   * before destroying an extension that owns it, the same contract every
   * {@link RenderPipeline} has.
   * @advanced
   */
  public get framePasses(): RenderPipeline {
    return (this._framePasses ??= new RenderPipeline({ label: 'framePasses' }));
  }

  /**
   * The off-screen target the frame is drawn into while {@link framePasses}
   * holds passes - the source a frame pass reads.
   *
   * Sized to the logical surface times {@link pixelRatio} in texels, with a view
   * in logical units, so the frame is rasterized at the density the canvas is
   * and a pass sees the coordinates the scene was drawn in. It follows every
   * resize, so a pass built once against it stays valid for the application's
   * life.
   *
   * Reading this allocates it. An application that never adds a frame pass
   * never pays for it.
   * @advanced
   */
  public get frameTexture(): RenderTexture {
    if (this._frameTexture === null) {
      this._frameTexture = new RenderTexture(1, 1);
      this._resizeFrameTexture();
    }

    return this._frameTexture;
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
    return this._geometry.policy;
  }

  public set sizing(sizing: CanvasSizing | null) {
    this._geometry.policy = sizing;
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

  public get audio(): AudioSystem {
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
    return this._geometry.width;
  }

  /** Height of the logical coordinate system. See {@link Application.width}. */
  public get height(): number {
    return this._geometry.height;
  }

  /**
   * Device pixels per CSS pixel the backing store is scaled by. Defaults to the
   * host `devicePixelRatio` clamped to `2` - crisp on HiDPI out of the box,
   * without the fill-rate cost a DPR-3 phone would otherwise pay - unless an
   * explicit `canvas.pixelRatio` option was given.
   *
   * On that default it follows the host: moving the window to a display of a
   * different density, or zooming the page, re-derives the backing store at the
   * new ratio wherever the host can report the change. An explicit
   * `canvas.pixelRatio` never tracks anything.
   *
   * It converts a requested render resolution into backing-store pixels and
   * nothing else. Which render resolution is requested is the sizing policy's
   * decision, so `app.canvas.width` is `pixelRatio` times that resolution, not
   * times {@link Application.width}: the two coincide only while the logical
   * view and the render resolution are the same size.
   */
  public get pixelRatio(): number {
    return this._geometry.pixelRatio;
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
    return this._geometry.toLogical(backingStoreX, backingStoreY);
  }

  /**
   * Initialize the render backend, await capability detection, and start the
   * per-frame loop without activating a scene. Use `start(target, data?)` to
   * start directly into a registered scene. Idempotent - if the application
   * is already running the call is a no-op. On error the state returns to
   * `Stopped` and the error propagates. A `stop()` or
   * `destroy()` made while startup is still loading wins over it: the run
   * still settles, but the state that call wrote is the one that stands, so a
   * resolved `start()` does not by itself mean the state is `Running`.
   */
  public async start(): Promise<this>;
  /**
   * Initialize the render backend, await capability detection, activate
   * `target` - a registered string key, or a constructor registered in
   * `ApplicationOptions.scenes` - and start the per-frame loop. Idempotent -
   * if the application is already running the call is a no-op. On error the
   * state returns to `Stopped` and the error propagates. A `stop()` or
   * `destroy()` made while startup is still loading wins over it: the run
   * still settles, but the state that call wrote is the one that stands, so a
   * resolved `start()` does not by itself mean the state is `Running`.
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

    this._setState(ApplicationState.Loading);

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

      // Ahead of the initial navigation, so tooling is attached in time to see
      // the first scene load. Once per application: a later `start()` after a
      // `stop()` is a restart, not a second application.
      if (__DEV__ && !this._announced) {
        this._announced = true;
        onAppInitialized.dispatch(this);
      }

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

      // Only if the loop this run started is still the live one. A `stop()`
      // or `destroy()` that landed inside the `Loading` window already halted
      // it and wrote its own state; promoting over that would advertise
      // `Running` for a loop that no longer schedules frames, and every later
      // `start()`/`stop()` would early-return on the lie.
      if (this._scheduler.active) this._setState(ApplicationState.Running);
    } catch (error) {
      this._stopFrameLoop();
      this._setState(ApplicationState.Stopped);
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
    this._scheduler.start();
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
    if (!this._scheduler.stop()) {
      return;
    }

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
   * 1. **Pre-frame** - `app.systems` pre-frame phase, then the active scene's
   *    own systems' pre-frame phase. The engine's input, interaction, audio,
   *    tween, animation and rendering systems are ordinary systems in this
   *    phase, pinned to the head of it by their {@link SystemOrder} `Core*`
   *    values, so this frame's input snapshot is current before anything
   *    simulates. An application system registered without an explicit
   *    `order` runs after all of them.
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
   *    flush, frame-time stat write.
   * 6. **Post-frame** - `app.systems` post-frame phase, then the active
   *    scene's own systems' post-frame phase, both handed the frame's
   *    remaining time ({@link FrameBudget}). Work placed here overlaps the GPU
   *    drawing the frame just submitted.
   *
   * Running one frame is all this does: scheduling belongs to the loop, so a
   * manual call runs an extra frame alongside a live loop rather than forking
   * a second one, and does not restart a loop that {@link Application.stop}
   * has halted - the body is skipped entirely while the loop is not live.
   *
   * The simulation `delta` forwarded to all update recipients is clamped to
   * an internal maximum (100 ms) so that debugger pauses, device sleep/resume,
   * or severe browser scheduling gaps cannot produce runaway animation
   * advancement. Real wall-clock time and RAF cadence are unaffected; the raw
   * elapsed delta is recorded separately in `backend.stats.rawFrameDeltaMs`.
   */
  public update(timestamp: number = this.platform.now()): this {
    if (this._scheduler.active) {
      if (this.pauseOnHidden && !this._documentVisible) {
        this._scheduler.skipFrame(timestamp);

        return this;
      }

      this.systems._beginFrame();
      this.scenes._beginFrame();

      // Frame guard (render-fail surface): a throwing frame is reported
      // through the error pipeline instead of killing the RAF loop; the loop
      // halts only after `maxConsecutiveFrameErrors` consecutive failures.
      try {
        const { rawDeltaMs, frameDelta, fixedSteps } = this._scheduler.beginFrame(timestamp);
        const frameStart = this.platform.now();

        this._frameStart = frameStart;
        this._inFrame = true;

        if (__DEV__) Perf.mark(frameStartMark);

        // The index counts in frames, and this is where one begins. Advancing it
        // per render instead would rotate the window several times in a frame
        // that draws more than one root and push every consumer out of it.
        this._dirtyIndex.advance();
        detachedNodeDirtyIndex.advance();

        this.backend.resetStats();
        this.backend.stats.rawFrameDeltaMs = rawDeltaMs;

        // Bring per-frame state in sync before anything simulates: the engine's
        // own input, interaction, audio, tween, animation and rendering systems
        // sit at the head of this phase (negative `order`), application systems
        // follow.
        this.systems._preFrame(frameDelta);
        this.scenes.preFrame(frameDelta);

        // Fixed-timestep steps (0..N) for deterministic logic/physics, after input
        // so they see this frame's input and before the variable update/draw.
        for (let step = 0; step < fixedSteps; step++) {
          this.systems._fixedUpdate(this._scheduler.stepSeconds);
          this.scenes.fixedUpdate(this._scheduler.stepSeconds);
          this.onFixedFrame.dispatch(this._scheduler.stepSeconds);
        }

        this._scheduler.captureAlpha();

        if (__DEV__) Perf.mark(systemsStartMark);
        this.systems._update(frameDelta);
        if (__DEV__) Perf.measure(systemsMeasure, systemsStartMark);

        this.scenes.update(frameDelta);
        this.scenes._updateTransition(frameDelta);

        this._drawFrame();

        this.onFrame.dispatch(frameDelta);
        this.backend.flush();
        this.backend.stats.frameTimeMs = this.platform.now() - frameStart;

        // After the flush, so this work overlaps the GPU drawing the frame
        // instead of delaying it, and so the budget it is handed is what the
        // frame has actually left rather than a guess made up front.
        this.systems._postFrame(frameDelta, this._frameBudget);
        this.scenes.postFrame(frameDelta, this._frameBudget);

        if (__DEV__) {
          Perf.measure(frameMeasure, frameStartMark);
          Perf.clearMarks(frameStartMark);
          Perf.clearMarks(systemsStartMark);
          Perf.clearMeasures(frameMeasure);
          Perf.clearMeasures(systemsMeasure);
        }

        this._errors.resetFrameErrors();
      } catch (error) {
        this._handleFrameError(error);
      } finally {
        this._inFrame = false;

        this.scenes._endFrame();
        this.systems._endFrame();

        this._scheduler.endFrame();
      }
    }

    return this;
  }

  /**
   * Frame-guard reaction: hand the failure to the error reporter and halt the
   * loop once it reports the guard's tolerance exhausted. Deliberately does
   * NOT call {@link Application.stop} on halt - unloading the scene could
   * rethrow the same error.
   */
  private _handleFrameError(error: unknown): void {
    if (!this._errors.recordFrameError(error)) {
      return;
    }

    this._stopFrameLoop();
    this._setState(ApplicationState.Stopped);
    logger.error(`Frame loop halted after ${maxConsecutiveFrameErrors} consecutive frame errors.`, {
      source: 'core',
      error: error instanceof Error ? error : new Error(String(error)),
    });
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
    if (!this._scheduler.active) {
      return this;
    }

    if (this._state === ApplicationState.Running) this._setState(ApplicationState.Halting);

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

    this._setState(ApplicationState.Stopped);

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

    // Ahead of the rebase, which dispatches `onResize` synchronously: a
    // listener reading `options.canvas` has to see the resolution it is being
    // told about, not the previous one.
    this.options.canvas = {
      ...this.options.canvas,
      width,
      height,
      pixelRatio: this._geometry.pixelRatio,
    };

    this._geometry.rebase(width, height);

    return this;
  }

  /**
   * Draw the frame: the scene, the systems' draw hooks and any transition, into
   * the canvas - or, while {@link framePasses} holds passes, into
   * {@link frameTexture}, with the pipeline played against the frame afterwards.
   *
   * The redirect wraps the whole block rather than the scene alone so a pass
   * sees the finished frame. A system that draws a debug overlay and a scene
   * transition are both part of the picture an effect is applied to; a caller
   * who wants an overlay left unfiltered adds it as a frame pass instead, after
   * the effect.
   */
  private _drawFrame(): void {
    const passes = this._framePasses;

    if (passes === null || passes.size === 0) {
      // The frame starts from `clearColor`, so a scene's `draw()` never has to
      // open with a clear of its own. Opt out with `autoClear: false` when the
      // pipeline wants the previous frame preserved or clears it itself.
      if (this._autoClear) {
        this._rendering.clear(this.clearColor);
      }

      this._drawSceneAndSystems();

      return;
    }

    const texture = this.frameTexture;

    this._frameRedirect ??= new BackendTargetPass(() => this._drawSceneAndSystems());
    this._backend.execute(this._frameRedirect.retarget(texture, texture.view, this._autoClear ? this.clearColor : null));

    passes.execute(this._rendering);
  }

  /** The frame's own drawing, in the order the transition placement asks for. */
  private _drawSceneAndSystems(): void {
    if (this.scenes._transitionPlacement() === 'scene') {
      this.scenes.draw(this._rendering);
      this.scenes._renderTransition(this._rendering);
      this.systems._draw(this._rendering);

      return;
    }

    this.scenes.draw(this._rendering);
    this.systems._draw(this._rendering);
    this.scenes._renderTransition(this._rendering);
  }

  /**
   * Drop the frame slot while the backend is still alive: the pipeline's passes
   * release GPU state of their own, and the frame target is an attachment a
   * live backend has to see destroyed.
   */
  private _releaseFramePasses(): void {
    this._framePasses?.destroy();
    this._framePasses = null;
    this._frameRedirect = null;
    this._frameTexture?.destroy();
    this._frameTexture = null;
  }

  /**
   * Bring the frame target onto the current geometry. Texels follow the backing
   * store so the frame is rasterized at the canvas's density; the view stays in
   * logical units so a pass reads the coordinates the scene was drawn in.
   */
  private _resizeFrameTexture(): void {
    const texture = this._frameTexture;

    if (texture === null) {
      return;
    }

    const logicalWidth = Math.max(1, this._geometry.width);
    const logicalHeight = Math.max(1, this._geometry.height);
    const ratio = this._geometry.pixelRatio;

    texture.setSize(Math.max(1, Math.round(logicalWidth * ratio)), Math.max(1, Math.round(logicalHeight * ratio)));
    texture.view.resize(logicalWidth, logicalHeight);
    texture.view.setCenter(logicalWidth / 2, logicalHeight / 2);
  }

  /**
   * Bring the render target and this application's own listeners onto a
   * geometry the sizing unit has committed.
   *
   * Inert before the backend exists: the first commit runs in the constructor,
   * ahead of the render context the later ones resize.
   */
  private _onGeometryCommit(logicalWidth: number, logicalHeight: number): void {
    if (this._backend === undefined) {
      return;
    }

    this._backend.resize(logicalWidth, logicalHeight);
    this._rendering.resize(logicalWidth, logicalHeight);
    this._resizeFrameTexture();
    this._framePasses?.resize(logicalWidth, logicalHeight);
    this.onResize.dispatch(logicalWidth, logicalHeight, this);
  }

  /** Undo the host subscriptions held directly rather than through a destroy scope. */
  private _releasePlatformSubscriptions(): void {
    this._visibilitySubscription?.();
    this._visibilitySubscription = null;
    this._geometry.destroy();
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
   * Tear down every owned subsystem (loader, the core systems - input,
   * interaction, audio, coroutines, tweens, animations, rendering - the app system registry, backend,
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
   * rendering context, audio system, or backend are destroyed, so a scene's
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
   * begins - including for the incoming scene of a navigation still inside
   * `load()`, which is aborted and awaited rather than left to finish
   * preparing against subsystems this call has released.
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

    this._releasePlatformSubscriptions();
    this._geometry.detachPolicy();
    this._releaseDom();

    if (this._scheduler.active) {
      if (this._state === ApplicationState.Running) this._setState(ApplicationState.Halting);

      this._stopFrameLoop();
    }

    this._setState(ApplicationState.Destroying);

    this._destroyPromise = this._disposeManagedResources()
      .catch((error: unknown) => {
        logger.error('Application.destroy() failed during teardown.', { source: 'Application', ...(error instanceof Error && { error }) });
        this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
      })
      .then(() => {
        this._setState(ApplicationState.Destroyed);
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

    // The core systems run as systems but belong to the application, not to
    // the registry - which destroys whatever is still registered when it goes
    // down. Unregister them first so they are torn down exactly once, here, in
    // reverse registration order.
    for (const system of [...this._coreSystems].reverse()) {
      this.systems._removeCoreSystem(system);
    }

    this.systems.destroy();

    this._releaseFramePasses();
    this._rendering.destroy();
    this.animations.destroy();
    this.tweens.destroy();
    this.coroutines.destroy();
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

    this._scheduler.destroy();
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

  /**
   * The renderer bindings this application equips a backend with: the core set
   * derived from the resolved rendering options, followed by every binding the
   * extension snapshot contributed. Rebuilt per backend, because the
   * WebGPU-to-WebGL2 fallback constructs a second one.
   */
  private _rendererBindings(): readonly RendererBinding[] {
    return [...buildCoreRendererBindings(this.options.rendering ?? {}), ...this._snapshot.renderers];
  }

  /** Build a backend of `backendType`, wired to this application's lifecycle signals. */
  private _createBackend(backendType: BackendType): RenderBackend {
    return createBackend(this, backendType, this._rendererBindings(), {
      onLost: () => {
        this.onBackendLost.dispatch();
      },
      onRestored: () => {
        this.onBackendRestored.dispatch();
      },
      onRenderError: error => {
        this._errors.recordRenderError(error);
      },
    });
  }

  private async initializeBackend(): Promise<void> {
    try {
      await this._backend.initialize();
      this.publishAssetVariantProfile();
    } catch (error) {
      if (this.options.backend?.type !== 'auto' || this._backendType !== 'webgpu') {
        throw error;
      }

      this._backend.destroy();
      this._backendType = 'webgl2';
      this._backend = this._createBackend(this._backendType);

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
      this._backend.resize(this._geometry.width, this._geometry.height);
      this._rendering.resize(this._geometry.width, this._geometry.height);

      await this._backend.initialize();
      this.publishAssetVariantProfile();
    }
  }

  /**
   * Hand the loader what the initialized backend can actually accept, so a
   * variant rule can pick a compressed format or a density per device.
   *
   * Runs after every successful backend initialization, the WebGPU-to-WebGL2
   * fallback included: the two backends do not support the same format families,
   * and a profile left over from the abandoned attempt would offer files the live
   * backend refuses.
   */
  private publishAssetVariantProfile(): void {
    this.loader.variants.profile = {
      textureFormats: this._backend.supportedTextureFormats,
      resolution: this._backend.rootResolution,
    };
  }
}
