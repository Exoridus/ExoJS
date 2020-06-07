import { Signal } from './Signal';
import type { Time } from './Time';
import type { Scene } from './Scene';
import type { Application } from './Application';

export class SceneManager {

    private readonly _app: Application;
    private _scene: Scene | null = null;

    public readonly onChangeScene = new Signal();
    public readonly onStartScene = new Signal();
    public readonly onUpdateScene = new Signal();
    public readonly onStopScene = new Signal();

    public constructor(app: Application) {
        this._app = app;
    }

    public get scene(): Scene | null {
        return this._scene;
    }

    public set scene(scene: Scene | null) {
        this.setScene(scene);
    }

    public async setScene(scene: Scene | null): Promise<this> {
        if (scene !== this._scene) {
            this._unloadScene();

            this._scene = scene;
            this.onChangeScene.dispatch(scene);

            if (scene !== null) {
                scene.app = this._app;
                await scene.load(this._app.loader);
                scene.init(await this._app.loader.load());

                this.onStartScene.dispatch(scene);
            }
        }

        return this;
    }

    public update(delta: Time): this {
        if (this._scene !== null) {
            this._scene.update(delta);
            this._scene.draw(this._app.renderManager);
            this.onUpdateScene.dispatch(this._scene);
        }

        return this;
    }

    public destroy(): void {
        this._unloadScene();

        this.onChangeScene.destroy();
        this.onStartScene.destroy();
        this.onUpdateScene.destroy();
        this.onStopScene.destroy();
    }

    private _unloadScene(): this {
        if (this._scene !== null) {
            this.onStopScene.dispatch(this._scene);
            this._scene.unload();
            this._scene.destroy();
            this._scene = null;
        }

        return this;
    }
}
