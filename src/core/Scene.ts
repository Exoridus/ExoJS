import Time from "./time/Time";

export interface SceneData {
    load?: (loader: Loader) => Promise<void>;
    init?: (resources: ResourceContainer) => void;
    update?: (delta: Time) => void;
    draw?: (renderManager: RenderManager) => void;
    unload?: () => void;
    destroy?: () => void;
}

export default class Scene {

    private _app: Application | null = null;

    constructor(prototype: SceneData) {

        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    get app(): Application | null {
        return this._app;
    }

    set app(app: Application | null) {
        this._app = app;
    }

    async load(loader: Loader) {
        // do nothing
    }

    init(resources: ResourceContainer) {
        // do nothing
    }

    update(delta: Time) {
        // do nothing
    }

    draw(renderManager: RenderManager) {
        // do nothing
    }

    unload() {
        // do nothing
    }

    destroy() {
        this._app = null;
    }
}
