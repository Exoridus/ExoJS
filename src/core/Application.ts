import { Capabilities } from './capabilities';
import { Clock } from './Clock';
import { SceneManager } from './SceneManager';
import { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { InputManager } from '@/input/InputManager';
import { Loader } from '@/resources/Loader';
import { TweenManager } from '@/animation/TweenManager';
import { Signal } from './Signal';
import { Color } from './Color';
import type { Time } from './Time';
import type { Scene } from './Scene';
import type { CacheStore } from '@/resources/CacheStore';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { GamepadDefinition } from '@/input/GamepadDefinitions';

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

export class Application {
    public readonly options: ApplicationOptions;
    public readonly canvas: HTMLCanvasElement;
    public readonly loader: Loader;
    public readonly inputManager: InputManager;
    public readonly sceneManager: SceneManager;
    public readonly tweens: TweenManager = new TweenManager();
    public readonly onResize = new Signal<[number, number, Application]>();

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
        this.inputManager = new InputManager(this);
        this.sceneManager = new SceneManager(this);
        this._updateHandler = this.update.bind(this);

        this._startupClock.start();
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

    public update(): this {
        if (this._status === ApplicationStatus.Running) {
            const frameDelta = this._frameClock.elapsedTime;
            const frameStart = performance.now();

            this.backend.resetStats();

            this.inputManager.update();
            this.tweens.update(frameDelta.seconds);
            const runtimeView = (this.backend as Partial<{
                view: Partial<{ update(deltaMilliseconds: number): unknown; }>;
            }>).view;

            if (runtimeView && typeof runtimeView.update === 'function') {
                runtimeView.update(frameDelta.milliseconds);
            }

            this.sceneManager.update(frameDelta);
            this.backend.flush();
            this.backend.stats.frameTimeMs = performance.now() - frameStart;
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._frameCount++;
        }

        return this;
    }

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

    public resize(width: number, height: number): this {
        this.backend.resize(width, height);
        this.onResize.dispatch(width, height, this);

        return this;
    }

    public destroy(): void {
        this.stop();
        this.loader.destroy();
        this.inputManager.destroy();
        this.tweens.destroy();
        this._backend.destroy();
        this.sceneManager.destroy();
        this._startupClock.destroy();
        this._activeClock.destroy();
        this._frameClock.destroy();
        this.onResize.destroy();
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
            return new WebGpuBackend(this);
        }

        return new WebGl2Backend(this);
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
