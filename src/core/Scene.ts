import type { Time } from './Time';
import type { Loader } from 'resources/Loader';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import { Container } from 'rendering/Container';
import type { SceneNode } from './SceneNode';
import type { Application } from './Application';
import type { Pointer } from 'input/Pointer';
import type { Vector } from 'math/Vector';

export type SceneStackMode = 'overlay' | 'modal' | 'opaque';
export type SceneInputMode = 'capture' | 'passthrough' | 'transparent';

export interface SceneParticipationPolicy {
    mode?: SceneStackMode;
    input?: SceneInputMode;
}

export type SceneInputEvent =
    | { type: 'keyDown'; channel: number; }
    | { type: 'keyUp'; channel: number; }
    | { type: 'pointerEnter'; pointer: Pointer; }
    | { type: 'pointerLeave'; pointer: Pointer; }
    | { type: 'pointerDown'; pointer: Pointer; }
    | { type: 'pointerMove'; pointer: Pointer; }
    | { type: 'pointerUp'; pointer: Pointer; }
    | { type: 'pointerTap'; pointer: Pointer; }
    | { type: 'pointerSwipe'; pointer: Pointer; }
    | { type: 'pointerCancel'; pointer: Pointer; }
    | { type: 'mouseWheel'; wheel: Vector; };

export interface SceneData {
    load?: (loader: Loader) => Promise<void> | void;
    init?: (loader: Loader) => Promise<void> | void;
    update?: (delta: Time) => void;
    draw?: (renderManager: SceneRenderRuntime) => void;
    handleInput?: (event: SceneInputEvent) => boolean | void;
    unload?: (loader: Loader) => Promise<void> | void;
}

export type SceneInstance<T extends SceneData = SceneData> = Scene & T;

export class Scene {

    private _app: Application | null = null;
    private readonly _root = new Container();
    private _stackMode: SceneStackMode = 'overlay';
    private _inputMode: SceneInputMode = 'capture';

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

    public get stackMode(): SceneStackMode {
        return this._stackMode;
    }

    public set stackMode(mode: SceneStackMode) {
        this._stackMode = mode;
    }

    public get inputMode(): SceneInputMode {
        return this._inputMode;
    }

    public set inputMode(mode: SceneInputMode) {
        this._inputMode = mode;
    }

    public addChild(child: SceneNode): this {
        this._root.addChild(child);

        return this;
    }

    public removeChild(child: SceneNode): this {
        this._root.removeChild(child);

        return this;
    }

    public setParticipationPolicy(policy: SceneParticipationPolicy): this {
        if (policy.mode) {
            this._stackMode = policy.mode;
        }

        if (policy.input) {
            this._inputMode = policy.input;
        }

        return this;
    }

    public getParticipationPolicy(): SceneParticipationPolicy {
        return {
            mode: this._stackMode,
            input: this._inputMode,
        };
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

    public handleInput(_event: SceneInputEvent): boolean | void {
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
