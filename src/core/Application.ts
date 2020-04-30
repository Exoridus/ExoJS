import { Clock } from './Clock';
import { SceneManager } from './SceneManager';
import { RenderManager } from 'rendering/RenderManager';
import { InputManager } from 'input/InputManager';
import { Loader } from 'resources/Loader';
import { Signal } from './Signal';
import { Color } from './Color';
import { Time } from './Time';
import { Scene } from './Scene';
import { GamepadMapping } from "input/GamepadMapping";
import { DatabaseInterface } from "types/DatabaseInterface";
import { DefaultGamepadMapping } from "input/DefaultGamepadMapping";

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
    gamepadMapping: GamepadMapping;
    pointerDistanceThreshold: number;
    webglAttributes: WebGLContextAttributes;
    resourcePath: string;
    requestOptions: RequestInit;
    database?: DatabaseInterface;
}

const defaultAppSettings: ApplicationOptions = {
    canvas: document.createElement('canvas') as HTMLCanvasElement,
    width: 800,
    height: 600,
    clearColor: Color.CornflowerBlue,
    debug: false,
    spriteRendererBatchSize: 4096, // ~ 262kb
    particleRendererBatchSize: 8192, // ~ 1.18mb
    primitiveRendererBatchSize: 65536, // ~ 786kb
    gamepadMapping: new DefaultGamepadMapping(),
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
};

export class Application {
    public readonly options: ApplicationOptions;
    public readonly canvas: HTMLCanvasElement;
    public readonly loader: Loader;
    public readonly renderManager: RenderManager;
    public readonly inputManager: InputManager;
    public readonly sceneManager: SceneManager;
    public readonly onResize = new Signal();

    private readonly _updateHandler: () => void;
    private readonly _startupClock: Clock = new Clock();
    private readonly _activeClock: Clock = new Clock();
    private readonly _frameClock: Clock = new Clock();

    private _status: ApplicationStatus = ApplicationStatus.Stopped;
    private _frameCount = 0;
    private _frameRequest = 0;

    constructor(appSettings?: Partial<ApplicationOptions>) {
        this.options = { ...defaultAppSettings, ...appSettings };
        this.canvas = this.options.canvas;

        if (!this.canvas.hasAttribute('tabindex')) {
            this.canvas.setAttribute('tabindex', '-1');
        }

        this.loader = new Loader(this.options);
        this.renderManager = new RenderManager(this);
        this.inputManager = new InputManager(this);
        this.sceneManager = new SceneManager(this);
        this._updateHandler = this.update.bind(this);

        this._startupClock.start();
    }

    get status() {
        return this._status;
    }

    get startupTime(): Time {
        return this._startupClock.elapsedTime;
    }

    get activeTime(): Time {
        return this._activeClock.elapsedTime;
    }

    get frameTime(): Time {
        return this._frameClock.elapsedTime;
    }

    get frameCount(): number {
        return this._frameCount;
    }

    async start(scene: Scene): Promise<this> {
        if (this._status === ApplicationStatus.Stopped) {
            this._status = ApplicationStatus.Loading;
            await this.sceneManager.setScene(scene);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._activeClock.start();
            this._status = ApplicationStatus.Running;
        }

        return this;
    }

    update(): this {
        if (this._status === ApplicationStatus.Running) {
            this.inputManager.update();
            this.sceneManager.update(this._frameClock.elapsedTime);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._frameCount++;
        }

        return this;
    }

    stop(): this {
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

    resize(width: number, height: number): this {
        this.renderManager.resize(width, height);
        this.onResize.dispatch(width, height, this);

        return this;
    }

    destroy(): void {
        this.stop();
        this.loader.destroy();
        this.inputManager.destroy();
        this.renderManager.destroy();
        this.sceneManager.destroy();
        this._startupClock.destroy();
        this._activeClock.destroy();
        this._frameClock.destroy();
        this.onResize.destroy();
    }
}
