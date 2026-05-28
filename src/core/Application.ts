import { TweenManager } from '@/animation/TweenManager';
import { type AudioManager, getAudioManager } from '@/audio/AudioManager';
import type { GamepadDefinition } from '@/input/GamepadDefinitions';
import type { GamepadSlotStrategy } from '@/input/InputManager';
import { InputManager } from '@/input/InputManager';
import { InteractionManager } from '@/input/InteractionManager';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderingContext, type RenderToOptions } from '@/rendering/RenderingContext';
import { type RenderNode } from '@/rendering/RenderNode';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { Loader, type LoaderOptions } from '@/resources/Loader';

import { Capabilities } from './capabilities';
import { Clock } from './Clock';
import { Color } from './Color';
import type { Scene } from './Scene';
import { SceneManager } from './SceneManager';
import { Signal } from './Signal';
import { Time } from './Time';
import { canvasSourceToDataUrl } from './utils';

export enum ApplicationStatus {
  Loading = 1,
  Running = 2,
  Halting = 3,
  Stopped = 4,
}

export interface CanvasApplicationOptions {
  /** Existing canvas element to use. If omitted, Application creates one. */
  element?: HTMLCanvasElement;
  /** Logical canvas width. Default: 800. */
  width?: number;
  /** Logical canvas height. Default: 600. */
  height?: number;
  /** Device/render pixel ratio applied to the backing buffer. Default: 1. */
  pixelRatio?: number;
  /** Canvas tabIndex. Default: -1, preserving current behavior. */
  tabIndex?: number;
  /** CSS image-rendering hint applied to the canvas style. */
  imageRendering?: 'auto' | 'pixelated' | 'crisp-edges';
}

export interface RenderingApplicationOptions {
  /** WebGL2-only debug wrapper. Ignored by WebGPU. */
  debug?: boolean;
  /** WebGL2 context attributes. Ignored by WebGPU. */
  webglAttributes?: WebGLContextAttributes;
  /** WebGL2 sprite renderer batch size. Ignored by WebGPU. */
  spriteRendererBatchSize?: number;
  /** WebGL2 particle renderer batch size. Ignored by WebGPU. */
  particleRendererBatchSize?: number;
}

export interface InputApplicationOptions {
  gamepadDefinitions?: GamepadDefinition[];
  gamepadSlotStrategy?: GamepadSlotStrategy;
  pointerDistanceThreshold?: number;
}

export interface ApplicationOptions {
  clearColor?: Color;
  backend?: BackendConfig;
  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
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

const maxDeltaMs = 100;

const createDefaultCanvas = (): HTMLCanvasElement => document.createElement('canvas');
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
  particleRendererBatchSize: 8192, // ~ 1.18mb
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
 * controller, input + interaction managers, asset loader, tween manager,
 * shared audio singleton, and the per-frame loop.
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
export class Application {
  public readonly options: ApplicationOptions;
  public readonly canvas: HTMLCanvasElement;
  public readonly loader: Loader;
  public readonly input: InputManager;
  public readonly interaction: InteractionManager;
  public readonly scene: SceneManager;
  public readonly tweens: TweenManager = new TweenManager();
  public readonly onResize = new Signal<[number, number, Application]>();
  public readonly onFrame = new Signal<[Time]>();
  public readonly onCanvasFocusChange = new Signal<[focused: boolean]>();
  public readonly onVisibilityChange = new Signal<[visible: boolean]>();
  public readonly onBackendLost = new Signal();
  public readonly onBackendRestored = new Signal();
  public pauseOnHidden = false;

  private readonly _updateHandler: () => void;
  private readonly _startupClock: Clock = new Clock();
  private readonly _activeClock: Clock = new Clock();
  private readonly _frameClock: Clock = new Clock();

  private _status: ApplicationStatus = ApplicationStatus.Stopped;
  private _pixelRatio: number = defaultCanvasSettings.pixelRatio;
  private _frameCount = 0;
  private _frameRequest = 0;
  private _backendType: 'webgl2' | 'webgpu';
  private _backend: RenderBackend;
  private _rendering: RenderingContext;
  private _capabilities: Capabilities | null = null;
  private _documentVisible = true;
  private _cursor = 'default';
  private readonly _visibilityChangeHandler = this._onDocumentVisibilityChange.bind(this);

  public constructor(appSettings: ApplicationOptions = {}) {
    const canvasOptions = appSettings.canvas ?? {};
    const loaderOptions = appSettings.loader ?? {};
    const renderingOptions = appSettings.rendering ?? {};
    const inputOptions = appSettings.input ?? {};
    const canvas = canvasOptions.element ?? createDefaultCanvas();

    const logicalWidth = canvasOptions.width ?? defaultCanvasSettings.width;
    const logicalHeight = canvasOptions.height ?? defaultCanvasSettings.height;
    this._pixelRatio = canvasOptions.pixelRatio ?? defaultCanvasSettings.pixelRatio;
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

    this.options = {
      clearColor: appSettings.clearColor ?? Color.cornflowerBlue,
      backend: appSettings.backend ?? defaultBackendConfig,
      canvas: {
        element: this.canvas,
        width: logicalWidth,
        height: logicalHeight,
        pixelRatio: this._pixelRatio,
        tabIndex: this.canvas.tabIndex,
        imageRendering: canvasOptions.imageRendering,
      },
      loader: {
        basePath: loaderOptions.basePath ?? '',
        fetchOptions: loaderOptions.fetchOptions ?? { ...defaultLoaderFetchOptions },
        cache: loaderOptions.cache,
        cacheStrategy: loaderOptions.cacheStrategy,
        concurrency: loaderOptions.concurrency,
      },
      rendering: {
        debug: renderingOptions.debug ?? defaultRenderingSettings.debug,
        webglAttributes: renderingOptions.webglAttributes ?? defaultRenderingSettings.webglAttributes,
        spriteRendererBatchSize: renderingOptions.spriteRendererBatchSize ?? defaultRenderingSettings.spriteRendererBatchSize,
        particleRendererBatchSize: renderingOptions.particleRendererBatchSize ?? defaultRenderingSettings.particleRendererBatchSize,
      },
      input: {
        gamepadDefinitions: inputOptions.gamepadDefinitions ?? [...defaultInputSettings.gamepadDefinitions],
        gamepadSlotStrategy: inputOptions.gamepadSlotStrategy ?? defaultInputSettings.gamepadSlotStrategy,
        pointerDistanceThreshold: inputOptions.pointerDistanceThreshold ?? defaultInputSettings.pointerDistanceThreshold,
      },
    };

    this.loader = new Loader(this.options.loader);
    this._backendType = this.resolveInitialBackendType();
    this._backend = this.createBackend(this._backendType);
      this._rendering = new RenderingContext(this._backend);
    this.input = new InputManager(this);
    this.interaction = new InteractionManager(this);
    this.scene = new SceneManager(this);
    this._updateHandler = this.update.bind(this);

    this._startupClock.start();

    if (typeof document !== 'undefined') {
      this._documentVisible = document.visibilityState === 'visible';
      document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    }

    this.input.onCanvasFocusChange.add(focused => {
      this.onCanvasFocusChange.dispatch(focused);
    });

    this.onVisibilityChange.add(visible => {
      getAudioManager()._applyVisibility(visible);
    });
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

  public get audio(): AudioManager {
    return getAudioManager();
  }

  /**
   * Initialize the render backend, await capability detection, set the
   * initial scene, and start the per-frame loop. Idempotent — if the
   * application is already running the call is a no-op. On error the
   * status returns to `Stopped` and the error propagates.
   */
  public async start(scene: Scene): Promise<this> {
    if (this._status === ApplicationStatus.Stopped) {
      this._status = ApplicationStatus.Loading;

      // Kick off capability detection in parallel with renderer init —
      // both are mostly-async startup work, no point serializing them.
      const capabilitiesPromise = Capabilities.ready;

      try {
        await this.initializeBackend();
        this._capabilities = await capabilitiesPromise;
        await this.scene.setScene(scene);
        this._frameRequest = requestAnimationFrame(this._updateHandler);
        this._frameClock.restart();
        this._activeClock.start();
        this._status = ApplicationStatus.Running;
      } catch (error) {
        this._status = ApplicationStatus.Stopped;
        throw error;
      }
    }

    return this;
  }

  /**
   * One iteration of the per-frame loop. Invoked by `requestAnimationFrame`.
   * When the document is hidden and `pauseOnHidden` is `true`, the frame
   * clock is reset and the body is skipped — preventing a large delta spike
   * on the first visible frame after resume.
   *
   * Each normal frame runs two distinct phases:
   *
   * **Update phase** — input and interaction flush, audio update, tween
   * advancement, optional view runtime update, then `scene.update(delta)` for
   * each participating scene in stack order.
   *
   * **Render phase** — `scene.draw(context)` for each participating scene in
   * stack order, followed by the transition overlay when active.
   *
   * **Frame dispatch / flush** — `onFrame` signal, backend GPU flush,
   * frame-time stat write, RAF reschedule.
   *
   * The simulation `delta` forwarded to all update recipients is clamped to
   * an internal maximum (100 ms) so that debugger pauses, device sleep/resume,
   * or severe browser scheduling gaps cannot produce runaway animation
   * advancement. Real wall-clock time and RAF cadence are unaffected; the raw
   * elapsed delta is recorded separately in `backend.stats.rawFrameDeltaMs`.
   */
  public update(): this {
    if (this._status === ApplicationStatus.Running) {
      if (this.pauseOnHidden && !this._documentVisible) {
        this._frameClock.restart();
        this._frameRequest = requestAnimationFrame(this._updateHandler);

        return this;
      }

      const rawDeltaMs = this._frameClock.elapsedTime.milliseconds;
      const clampedDeltaMs = Math.min(rawDeltaMs, maxDeltaMs);
      const frameDelta = Time.temp.set(clampedDeltaMs);
      const frameStart = performance.now();

      this.backend.resetStats();
      this.backend.stats.rawFrameDeltaMs = rawDeltaMs;

      this.input.update();
      this.interaction.update();
      getAudioManager().update();
      this.tweens.update(frameDelta.seconds);
      const runtimeView = (
        this.backend as Partial<{
          view: Partial<{ update(deltaMilliseconds: number): unknown }>;
        }>
      ).view;

      if (runtimeView && typeof runtimeView.update === 'function') {
        runtimeView.update(frameDelta.milliseconds);
      }

      this.scene.update(frameDelta);
      this.onFrame.dispatch(frameDelta);
      this.backend.flush();
      this.backend.stats.frameTimeMs = performance.now() - frameStart;
      this._frameRequest = requestAnimationFrame(this._updateHandler);
      this._frameClock.restart();
      this._frameCount++;
    }

    return this;
  }

  /**
   * Halt the per-frame loop, unload the active scene, and stop the active
   * + frame clocks. Leaves backend, input, audio, etc. intact — call
   * {@link Application.destroy} to release everything.
   */
  public stop(): this {
    if (this._status === ApplicationStatus.Running) {
      this._status = ApplicationStatus.Halting;
      cancelAnimationFrame(this._frameRequest);
      void this.scene.setScene(null).catch((error: unknown) => {
        console.error('Application.stop() failed to unload the active scene.', error);
      });
      this._activeClock.stop();
      this._frameClock.stop();
      this._status = ApplicationStatus.Stopped;
    }

    return this;
  }

  /**
   * Resize the canvas and the active backend's root render target.
   * Dispatches {@link Application.onResize} after the backend has been
   * notified.
   */
  public resize(width: number, height: number): this {
    this._applyCanvasSize(width, height);
    this.options.canvas = {
      ...(this.options.canvas ?? {}),
      width,
      height,
      pixelRatio: this._pixelRatio,
    };

    this.backend.resize(width, height);
    this.onResize.dispatch(width, height, this);

    return this;
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
   * Renders `node` into an off-screen {@link RenderTexture} and returns it.
   *
   * Convenience wrapper that delegates to {@link RenderingContext.renderTo}.
   */
  public renderTo(node: RenderNode, options: RenderToOptions): RenderTexture {
    return this._rendering.renderTo(node, options);
  }

  /**
   * Tear down every owned subsystem (loader, interaction, input, tweens,
   * backend, scene manager, all clocks, all signals) and release event
   * listeners. The application instance is unusable after this call.
   */
  public destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
    }

    this.stop();
    this.loader.destroy();
    this.interaction.destroy();
    this.input.destroy();
    this.tweens.destroy();
    this._backend.destroy();
    this.scene.destroy();
    this._startupClock.destroy();
    this._activeClock.destroy();
    this._frameClock.destroy();
    this.onResize.destroy();
    this.onFrame.destroy();
    this.onCanvasFocusChange.destroy();
    this.onVisibilityChange.destroy();
    this.onBackendLost.destroy();
    this.onBackendRestored.destroy();
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

  private createBackend(backendType: 'webgl2' | 'webgpu'): RenderBackend {
    if (backendType === 'webgpu') {
      const backend = new WebGpuBackend(this);

      backend.onDeviceLost.add(() => {
        this.onBackendLost.dispatch();
      });
      backend.onDeviceRestored.add(() => {
        this.onBackendRestored.dispatch();
      });

      return backend;
    }

    const backend = new WebGl2Backend(this);

    backend.onContextLost.add(() => {
      this.onBackendLost.dispatch();
    });
    backend.onContextRestored.add(() => {
      this.onBackendRestored.dispatch();
    });

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
      this._backend = this.createBackend(this._backendType);
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
