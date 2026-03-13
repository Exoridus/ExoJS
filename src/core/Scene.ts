import type { Time } from './Time';
import type { Loader } from 'resources/Loader';
import type { ResourceContainer } from 'resources/ResourceContainer';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import { Container } from 'rendering/Container';
import type { SceneNode } from './SceneNode';
import type { Application } from './Application';

export interface SceneData {
    load?: (loader: Loader) => Promise<void>;
    init?: (resources: ResourceContainer) => void;
    update?: (delta: Time) => void;
    draw?: (renderManager: SceneRenderRuntime) => void;
    unload?: () => void;
    destroy?: () => void;
}

export class Scene {

    private _app: Application | null = null;
    private readonly _root = new Container();

    public constructor(definition: SceneData) {

        if (definition) {
            Object.assign(this, definition);
        }
    }

    public get app(): Application | null {
        return this._app;
    }

    public set app(app: Application | null) {
        this._app = app;
    }

    public get root(): Container {
        return this._root;
    }

    public addChild(child: SceneNode): this {
        this._root.addChild(child);

        return this;
    }

    public removeChild(child: SceneNode): this {
        this._root.removeChild(child);

        return this;
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

    public draw(renderManager: SceneRenderRuntime): void {
        // do nothing
    }

    public unload(): void {
        // do nothing
    }

    public destroy(): void {
        this._root.destroy();
        this._app = null;
    }
}
