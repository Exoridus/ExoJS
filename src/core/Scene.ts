import type { Time } from './Time';
import type { Loader } from 'resources/Loader';
import type { ResourceContainer } from 'resources/ResourceContainer';
import type { RenderManager } from 'rendering/RenderManager';
import type { Application } from './Application';

export interface ISceneData {
    load?: (loader: Loader) => Promise<void>;
    init?: (resources: ResourceContainer) => void;
    update?: (delta: Time) => void;
    draw?: (renderManager: RenderManager) => void;
    unload?: () => void;
    destroy?: () => void;
}

export class Scene {

    private _app: Application | null = null;

    public constructor(prototype: ISceneData) {

        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    public get app(): Application | null {
        return this._app;
    }

    public set app(app: Application | null) {
        this._app = app;
    }

    public async load(loader: Loader): Promise<void> {
        // do nothing
    }

    public init(resources: ResourceContainer): void {
        // do nothing
    }

    public update(delta: Time): void {
        // do nothing
    }

    public draw(renderManager: RenderManager): void {
        // do nothing
    }

    public unload(): void {
        // do nothing
    }

    public destroy(): void {
        this._app = null;
    }
}
