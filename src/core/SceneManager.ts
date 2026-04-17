import { Signal } from './Signal';
import type { Time } from './Time';
import type { Scene } from './Scene';
import type { Application } from './Application';

export class SceneManager {

    private readonly _app: Application;
    private _scene: Scene | null = null;

    public readonly onChangeScene = new Signal<[Scene | null]>();
    public readonly onStartScene = new Signal<[Scene]>();
    public readonly onUpdateScene = new Signal<[Scene]>();
    public readonly onStopScene = new Signal<[Scene]>();

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
        if (scene === this._scene) {
            return this;
        }

        await this._unloadScene();

        if (scene === null) {
            this.onChangeScene.dispatch(null);

            return this;
        }

        scene.app = this._app;

        try {
            await scene.load(this._app.loader);
            await scene.init(this._app.loader);
        } catch (error) {
            let cleanupError: unknown = null;

            try {
                await scene.unload(this._app.loader);
            } catch (unloadError) {
                cleanupError = unloadError;
            }

            scene.destroy();

            if (cleanupError) {
                const initMessage = error instanceof Error ? error.message : String(error);
                const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);

                throw new Error(
                    `Failed to initialize scene: ${initMessage}. Cleanup also failed: ${cleanupMessage}.`,
                );
            }

            throw error;
        }

        this._scene = scene;
        this.onChangeScene.dispatch(scene);
        this.onStartScene.dispatch(scene);

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
        void this._unloadScene().catch((error: unknown) => {
            console.error('SceneManager.destroy() failed to unload the active scene.', error);
        });

        this.onChangeScene.destroy();
        this.onStartScene.destroy();
        this.onUpdateScene.destroy();
        this.onStopScene.destroy();
    }

    private async _unloadScene(): Promise<void> {
        if (this._scene !== null) {
            this.onStopScene.dispatch(this._scene);
            await this._scene.unload(this._app.loader);
            this._scene.destroy();
            this._scene = null;
        }
    }
}
