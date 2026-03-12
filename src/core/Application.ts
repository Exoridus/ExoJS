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
import type { IDatabase } from 'types/IDatabase';
import type { IRenderManager } from 'rendering/IRenderManager';
import type { GamepadDefinition } from 'input/GamepadDefinitions';

export enum ApplicationStatus {
    loading = 1,
    running = 2,
    halting = 3,
    stopped = 4,
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
    database?: IDatabase;
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

    private readonly updateHandler: () => void;
    private readonly startupClock: Clock = new Clock();
    private readonly activeClock: Clock = new Clock();
    private readonly frameClock: Clock = new Clock();

    private statusValue: ApplicationStatus = ApplicationStatus.stopped;
    private frameCountValue = 0;
    private frameRequestId = 0;
    private backendType: 'webgl2' | 'webgpu';
    private renderManagerValue: IRenderManager;

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
        this.backendType = this.resolveInitialBackendType();
        this.renderManagerValue = this.createRenderManager(this.backendType);
        this.inputManager = new InputManager(this);
        this.sceneManager = new SceneManager(this);
        this.updateHandler = this.update.bind(this);

        this.startupClock.start();
    }

    public get status(): ApplicationStatus {
        return this.statusValue;
    }

    public get startupTime(): Time {
        return this.startupClock.elapsedTime;
    }

    public get activeTime(): Time {
        return this.activeClock.elapsedTime;
    }

    public get frameTime(): Time {
        return this.frameClock.elapsedTime;
    }

    public get frameCount(): number {
        return this.frameCountValue;
    }

    public get renderManager(): IRenderManager {
        return this.renderManagerValue;
    }

    public async start(scene: Scene): Promise<this> {
        if (this.statusValue === ApplicationStatus.stopped) {
            this.statusValue = ApplicationStatus.loading;

            try {
                await this.initializeRenderManager();
                await this.sceneManager.setScene(scene);
                this.frameRequestId = requestAnimationFrame(this.updateHandler);
                this.frameClock.restart();
                this.activeClock.start();
                this.statusValue = ApplicationStatus.running;
            } catch (error) {
                this.statusValue = ApplicationStatus.stopped;
                throw error;
            }
        }

        return this;
    }

    public update(): this {
        if (this.statusValue === ApplicationStatus.running) {
            this.inputManager.update();
            this.sceneManager.update(this.frameClock.elapsedTime);
            this.renderManager.display();
            this.frameRequestId = requestAnimationFrame(this.updateHandler);
            this.frameClock.restart();
            this.frameCountValue++;
        }

        return this;
    }

    public stop(): this {
        if (this.statusValue === ApplicationStatus.running) {
            this.statusValue = ApplicationStatus.halting;
            cancelAnimationFrame(this.frameRequestId);
            this.sceneManager.setScene(null);
            this.activeClock.stop();
            this.frameClock.stop();
            this.statusValue = ApplicationStatus.stopped;
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
        this.renderManagerValue.destroy();
        this.sceneManager.destroy();
        this.startupClock.destroy();
        this.activeClock.destroy();
        this.frameClock.destroy();
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

    private createRenderManager(backendType: 'webgl2' | 'webgpu'): IRenderManager {
        if (backendType === 'webgpu') {
            return new WebGpuRenderManager(this);
        }

        return new RenderManager(this);
    }

    private async initializeRenderManager(): Promise<void> {
        try {
            await this.renderManagerValue.initialize();
        } catch (error) {
            if (this.options.backend?.type !== 'auto' || this.backendType !== 'webgpu') {
                throw error;
            }

            this.renderManagerValue.destroy();
            this.backendType = 'webgl2';
            this.renderManagerValue = this.createRenderManager(this.backendType);
            await this.renderManagerValue.initialize();
        }
    }

    private canUseWebGpu(): boolean {
        const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU; }>;

        return !!gpuNavigator.gpu;
    }
}
