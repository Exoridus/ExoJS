import { Clock } from './Clock';
import { SceneManager } from './SceneManager';
import { RenderManager } from 'rendering/RenderManager';
import { InputManager } from 'input/InputManager';
import { Loader, LoaderOptions } from 'resources/Loader';
import { defaultApplicationOptions } from 'const/defaults';
import { Signal } from './Signal';
import { AppStatus } from 'const/core';
import { Color } from './Color';
import { Time } from './Time';
import { Scene } from './Scene';

export interface ApplicationOptions {
    width: number;
    height: number;
    clearColor: Color;
    canvas?: HTMLCanvasElement;
    context: WebGLContextAttributes;
    loader: LoaderOptions;
}

export class Application {
    public readonly config: ApplicationOptions;
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

    private _status: AppStatus = AppStatus.STOPPED;
    private _frameCount = 0;
    private _frameRequest = 0;

    constructor(options: Partial<ApplicationOptions> = {}) {
        const config: ApplicationOptions = {
            ...defaultApplicationOptions,
            ...options
        };

        this.config = config;
        this.canvas = config.canvas ?? document.createElement('canvas');

        this.loader = new Loader(config.loader);
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
        if (this._status === AppStatus.STOPPED) {
            this._status = AppStatus.LOADING;
            await this.sceneManager.setScene(scene);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._activeClock.start();
            this._status = AppStatus.RUNNING;
        }

        return this;
    }

    update(): this {
        if (this._status === AppStatus.RUNNING) {
            this.inputManager.update();
            this.sceneManager.update(this._frameClock.elapsedTime);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._frameCount++;
        }

        return this;
    }

    stop(): this {
        if (this._status === AppStatus.RUNNING) {
            this._status = AppStatus.HALTING;
            cancelAnimationFrame(this._frameRequest);
            this.sceneManager.setScene(null);
            this._activeClock.stop();
            this._frameClock.stop();
            this._status = AppStatus.STOPPED;
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
