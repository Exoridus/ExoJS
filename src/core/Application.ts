import { Capabilities } from './capabilities';
import { Clock } from './Clock';
import { SceneManager } from './SceneManager';
import { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { InputManager } from '@/input/InputManager';
import { InteractionManager } from '@/input/InteractionManager';
import { Loader } from '@/resources/Loader';
import { TweenManager } from '@/animation/TweenManager';
import { Signal } from './Signal';
import { Color } from './Color';
import { Texture } from '@/rendering/texture/Texture';
import { canvasSourceToDataUrl } from './utils';
import type { Time } from './Time';
import type { Scene } from './Scene';
import type { CacheStore } from '@/resources/CacheStore';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { GamepadDefinition } from '@/input/GamepadDefinitions';
import type { GamepadSlotStrategy } from '@/input/InputManager';
import { getAudioManager, type AudioManager } from '@/audio/AudioManager';

export enum ApplicationStatus {
    Loading = 1,
    Running = 2,
    Halting = 3,
    Stopped = 4,
}

export interface ApplicationOptions {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    debug: boolean;
    clearColor: Color;
    spriteRendererBatchSize: number;
    particleRendererBatchSize: number;
    gamepadDefinitions: Array<GamepadDefinition>;
    gamepadSlotStrategy: GamepadSlotStrategy;
    pointerDistanceThreshold: number;
    webglAttributes: WebGLContextAttributes;
    resourcePath: string;
    requestOptions: RequestInit;
    cache?: CacheStore | ReadonlyArray<CacheStore>;
    backend?: BackendConfig;
}

type DefaultApplicationOptions = Omit<ApplicationOptions, 'canvas'>;

export interface WebGl2BackendConfig {
    type: 'webgl2';
}

export interface WebGpuBackendConfig {
    type: 'webgpu';
}

export interface AutoBackendConfig {
    type: 'auto';
}

/**
 * Discriminated union of backend selection options. `'auto'` picks WebGPU
 * when available, falling back to WebGL2 if adapter acquisition fails;
 * the explicit values pin the choice and skip the fallback path.
 */
export type BackendConfig = AutoBackendConfig | WebGl2BackendConfig | WebGpuBackendConfig;

const createDefaultCanvas = (): HTMLCanvasElement => document.createElement('canvas') as HTMLCanvasElement;
const defaultBackendConfig: AutoBackendConfig = { type: 'auto' };

const defaultAppSettings: DefaultApplicationOptions = {
    width: 800,
    height: 600,
    clearColor: Color.cornflowerBlue,
    debug: false,
    spriteRendererBatchSize: 4096, // ~ 262kb
    particleRendererBatchSize: 8192, // ~ 1.18mb
    gamepadDefinitions: [],
    gamepadSlotStrategy: 'sticky',
    pointerDistanceThreshold: 10,
    webglAttributes: {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        stencil: false,
        depth: false,
    },
    resourcePath: '',
    requestOptions: {
        method: 'GET',
        mode: 'cors',
        cache: 'default',
    },
    cache: undefined,
    backend: defaultBackendConfig,
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
    public readonly sceneManager: SceneManager;
    public readonly tweens: TweenManager = new TweenManager();
    public readonly onResize = new Signal<[number, number, Application]>();
    public readonly onFrame = new Signal<[Time]>();
    public readonly onCanvasFocusChange = new Signal<[focused: boolean]>();
    public readonly onVisibilityChange = new Signal<[visible: boolean]>();
    public readonly onBackendLost = new Signal<[]>();
    public readonly onBackendRestored = new Signal<[]>();
    public pauseOnHidden: boolean = false;

    private readonly _updateHandler: () => void;
    private readonly _startupClock: Clock = new Clock();
    private readonly _activeClock: Clock = new Clock();
    private readonly _frameClock: Clock = new Clock();

    private _status: ApplicationStatus = ApplicationStatus.Stopped;
    private _frameCount = 0;
    private _frameRequest = 0;
    private _backendType: 'webgl2' | 'webgpu';
    private _backend: RenderBackend;
    private _capabilities: Capabilities | null = null;
    private _documentVisible: boolean = true;
    private _cursor: string = 'default';
    private readonly _visibilityChangeHandler = this._onDocumentVisibilityChange.bind(this);

    public constructor(appSettings?: Partial<ApplicationOptions>) {
        this.options = {
            canvas: appSettings?.canvas ?? createDefaultCanvas(),
            ...defaultAppSettings,
            ...appSettings,
            backend: appSettings?.backend ?? defaultBackendConfig,
        };
        this.canvas = this.options.canvas;

        if (!this.canvas.hasAttribute('tabindex')) {
            this.canvas.setAttribute('tabindex', '-1');
        }

        this.loader = new Loader({
            resourcePath: this.options.resourcePath,
            requestOptions: this.options.requestOptions,
            cache: this.options.cache,
        });
        this._backendType = this.resolveInitialBackendType();
        this._backend = this.createBackend(this._backendType);
        this.input = new InputManager(this);
        this.interaction = new InteractionManager(this);
        this.sceneManager = new SceneManager(this);
        this._updateHandler = this.update.bind(this);

        this._startupClock.start();

        if (typeof document !== 'undefined') {
            this._documentVisible = document.visibilityState === 'visible';
            document.addEventListener('visibilitychange', this._visibilityChangeHandler);
        }

        this.input.onCanvasFocusChange.add((focused) => {
            this.onCanvasFocusChange.dispatch(focused);
        });

        this.onVisibilityChange.add((visible) => {
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
                await this.initializeRenderManager();
                this._capabilities = await capabilitiesPromise;
                await this.sceneManager.setScene(scene);
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
     * Skips the body when the document is hidden and `pauseOnHidden` is
     * `true`. Order: reset render stats → input + interaction update →
     * audio update → tween update → optional view runtime update →
     * scene-graph update → onFrame dispatch → backend flush → reschedule.
     */
    public update(): this {
        if (this._status === ApplicationStatus.Running) {
            if (this.pauseOnHidden && !this._documentVisible) {
                this._frameRequest = requestAnimationFrame(this._updateHandler);

                return this;
            }

            const frameDelta = this._frameClock.elapsedTime;
            const frameStart = performance.now();

            this.backend.resetStats();

            this.input.update();
            this.interaction.update();
            getAudioManager().update();
            this.tweens.update(frameDelta.seconds);
            const runtimeView = (this.backend as Partial<{
                view: Partial<{ update(deltaMilliseconds: number): unknown; }>;
            }>).view;

            if (runtimeView && typeof runtimeView.update === 'function') {
                runtimeView.update(frameDelta.milliseconds);
            }

            this.sceneManager.update(frameDelta);
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
            void this.sceneManager.setScene(null).catch((error: unknown) => {
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
        const source = (cursor instanceof Texture) ? cursor.source : cursor;

        if (source === null) {
            throw new Error('Provided Texture has no source.');
        }

        this._cursor = typeof source === 'string' ? source : `url(${canvasSourceToDataUrl(source)})`;
        this.canvas.style.cursor = this._cursor;

        return this;
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
        this.sceneManager.destroy();
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

            backend.onDeviceLost.add(() => { this.onBackendLost.dispatch(); });
            backend.onDeviceRestored.add(() => { this.onBackendRestored.dispatch(); });

            return backend;
        }

        const backend = new WebGl2Backend(this);

        backend.onContextLost.add(() => { this.onBackendLost.dispatch(); });
        backend.onContextRestored.add(() => { this.onBackendRestored.dispatch(); });

        return backend;
    }

    private async initializeRenderManager(): Promise<void> {
        try {
            await this._backend.initialize();
        } catch (error) {
            if (this.options.backend?.type !== 'auto' || this._backendType !== 'webgpu') {
                throw error;
            }

            this._backend.destroy();
            this._backendType = 'webgl2';
            this._backend = this.createBackend(this._backendType);
            await this._backend.initialize();
        }
    }

    private canUseWebGpu(): boolean {
        const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU; }>;

        return !!gpuNavigator.gpu;
    }
}
