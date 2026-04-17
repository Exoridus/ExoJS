import type { Time } from './Time';
import type { Loader } from 'resources/Loader';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import { Container } from 'rendering/Container';
import type { SceneNode } from './SceneNode';
import type { Application } from './Application';

export interface SceneData {
    load?: (loader: Loader) => Promise<void> | void;
    init?: (loader: Loader) => Promise<void> | void;
    update?: (delta: Time) => void;
    draw?: (renderManager: SceneRenderRuntime) => void;
    unload?: (loader: Loader) => Promise<void> | void;
}

export type SceneInstance<T extends SceneData = SceneData> = Scene & T;

export class Scene {

    private _app: Application | null = null;
    private readonly _root = new Container();

    public static create<T extends SceneData>(
        definition: T & ThisType<SceneInstance<T>>,
    ): SceneInstance<T> {
        return Object.assign(new Scene(), definition) as SceneInstance<T>;
    }

    public constructor() {}

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

    public load(loader: Loader): Promise<void> | void {
        // override in subclass or via Scene.create()
    }

    public init(loader: Loader): Promise<void> | void {
        // override in subclass or via Scene.create()
    }

    public update(delta: Time): void {
        // override in subclass or via Scene.create()
    }

    public draw(renderManager: SceneRenderRuntime): void {
        // override in subclass or via Scene.create()
    }

    public unload(loader: Loader): Promise<void> | void {
        // override in subclass or via Scene.create()
    }

    public destroy(): void {
        this._root.destroy();
        this._app = null;
    }
}
