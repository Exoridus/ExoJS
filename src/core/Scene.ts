import type { Time } from './Time';
import type { Loader } from 'resources/Loader';
import type { ResourceContainer } from 'resources/ResourceContainer';
import type { IRenderBackend } from 'rendering/IRenderBackend';
import type { Application } from './Application';

export interface SceneData {
    load?: (loader: Loader) => Promise<void>;
    init?: (resources: ResourceContainer) => void;
    update?: (delta: Time) => void;
    draw?: (renderManager: IRenderBackend) => void;
    unload?: () => void;
    destroy?: () => void;
}

export class Scene {

    private appValue: Application | null = null;

    public constructor(definition: SceneData) {

        if (definition) {
            Object.assign(this, definition);
        }
    }

    public get app(): Application | null {
        return this.appValue;
    }

    public set app(app: Application | null) {
        this.appValue = app;
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

    public draw(renderManager: IRenderBackend): void {
        // do nothing
    }

    public unload(): void {
        // do nothing
    }

    public destroy(): void {
        this.appValue = null;
    }
}
