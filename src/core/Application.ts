import { Clock } from './Clock';
import { SceneManager } from './SceneManager';
import { RenderManager } from 'rendering/RenderManager';
import { InputManager } from 'input/InputManager';
import { Loader } from 'resources/Loader';
import { Signal } from './Signal';
import { Color } from './Color';
import type { Time } from './Time';
import type { Scene } from './Scene';
import type { GamepadMapping } from 'input/GamepadMapping';
import type { IDatabase } from 'types/IDatabase';
import { DefaultGamepadMapping } from 'input/DefaultGamepadMapping';

export enum ApplicationStatus {
    loading = 1,
    running = 2,
    halting = 3,
    stopped = 4,
}

export interface IApplicationOptions {
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
    database?: IDatabase;
}

const defaultAppSettings: IApplicationOptions = {
    canvas: document.createElement('canvas') as HTMLCanvasElement,
    width: 800,
    height: 600,
    clearColor: Color.cornflowerBlue,
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
    public readonly options: IApplicationOptions;
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

    private _status: ApplicationStatus = ApplicationStatus.stopped;
    private _frameCount = 0;
    private _frameRequest = 0;

    public constructor(appSettings?: Partial<IApplicationOptions>) {
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

    public async start(scene: Scene): Promise<this> {
        if (this._status === ApplicationStatus.stopped) {
            this._status = ApplicationStatus.loading;
            await this.sceneManager.setScene(scene);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._activeClock.start();
            this._status = ApplicationStatus.running;
        }

        return this;
    }

    public update(): this {
        if (this._status === ApplicationStatus.running) {
            this.inputManager.update();
            this.sceneManager.update(this._frameClock.elapsedTime);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._frameCount++;
        }

        return this;
    }

    public stop(): this {
        if (this._status === ApplicationStatus.running) {
            this._status = ApplicationStatus.halting;
            cancelAnimationFrame(this._frameRequest);
            this.sceneManager.setScene(null);
            this._activeClock.stop();
            this._frameClock.stop();
            this._status = ApplicationStatus.stopped;
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
        this.renderManager.destroy();
        this.sceneManager.destroy();
        this._startupClock.destroy();
        this._activeClock.destroy();
        this._frameClock.destroy();
        this.onResize.destroy();
    }
}
