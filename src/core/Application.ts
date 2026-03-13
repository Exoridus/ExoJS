import { Clock } from './Clock';
import { SceneManager } from './SceneManager';
import { RenderManager } from 'rendering/RenderManager';
import { WebGpuRenderManager } from 'rendering/WebGpuRenderManager';
import { InputManager } from 'input/InputManager';
import { Loader } from 'resources/Loader';
import { Signal } from './Signal';
import { Color } from './Color';
import type { Time } from './Time';
import type { Scene } from './Scene';
import type { Database } from 'types/Database';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import type { GamepadDefinition } from 'input/GamepadDefinitions';

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
    primitiveRendererBatchSize: number;
    gamepadDefinitions: Array<GamepadDefinition>;
    pointerDistanceThreshold: number;
    webglAttributes: WebGLContextAttributes;
    resourcePath: string;
    requestOptions: RequestInit;
    database?: Database;
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
    primitiveRendererBatchSize: 65536, // ~ 786kb
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
    database: undefined,
    backend: defaultBackendConfig,
};

export class Application {
    public readonly options: ApplicationOptions;
    public readonly canvas: HTMLCanvasElement;
    public readonly loader: Loader;
    public readonly inputManager: InputManager;
    public readonly sceneManager: SceneManager;
    public readonly onResize = new Signal<[number, number, Application]>();

    private readonly _updateHandler: () => void;
    private readonly _startupClock: Clock = new Clock();
    private readonly _activeClock: Clock = new Clock();
    private readonly _frameClock: Clock = new Clock();

    private _status: ApplicationStatus = ApplicationStatus.Stopped;
    private _frameCount = 0;
    private _frameRequest = 0;
    private _backendType: 'webgl2' | 'webgpu';
    private _renderManager: SceneRenderRuntime;

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

        this.loader = new Loader(this.options);
        this._backendType = this.resolveInitialBackendType();
        this._renderManager = this.createRenderManager(this._backendType);
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

    public get renderManager(): SceneRenderRuntime {
        return this._renderManager;
    }

    public async start(scene: Scene): Promise<this> {
        if (this._status === ApplicationStatus.Stopped) {
            this._status = ApplicationStatus.Loading;

            try {
                await this.initializeRenderManager();
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
            this.inputManager.update();
            this.sceneManager.update(this._frameClock.elapsedTime);
            this.renderManager.display();
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
            this.sceneManager.setScene(null);
            this._activeClock.stop();
            this._frameClock.stop();
            this._status = ApplicationStatus.Stopped;
        }

        return this;
    }

    public resize(width: number, height: number): this {
        this.renderManager.resize(width, height);
        this.onResize.dispatch(width, height, this);

        return this;
    }

    public destroy(): void {
        this.stop();
        this.loader.destroy();
        this.inputManager.destroy();
        this._renderManager.destroy();
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

    private createRenderManager(backendType: 'webgl2' | 'webgpu'): SceneRenderRuntime {
        if (backendType === 'webgpu') {
            return new WebGpuRenderManager(this);
        }

        return new RenderManager(this);
    }

    private async initializeRenderManager(): Promise<void> {
        try {
            await this._renderManager.initialize();
        } catch (error) {
            if (this.options.backend?.type !== 'auto' || this._backendType !== 'webgpu') {
                throw error;
            }

            this._renderManager.destroy();
            this._backendType = 'webgl2';
            this._renderManager = this.createRenderManager(this._backendType);
            await this._renderManager.initialize();
        }
    }

    private canUseWebGpu(): boolean {
        const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU; }>;

        return !!gpuNavigator.gpu;
    }
}
