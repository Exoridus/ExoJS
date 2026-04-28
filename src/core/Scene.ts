import type { Time } from './Time';
import type { Loader } from '@/resources/Loader';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { Container } from '@/rendering/Container';
import type { RenderNode } from '@/rendering/RenderNode';
import type { Application } from './Application';
import type { Pointer } from '@/input/Pointer';
import type { Vector } from '@/math/Vector';

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
    draw?: (backend: RenderBackend) => void;
    handleInput?: (event: SceneInputEvent) => boolean | void;
    unload?: (loader: Loader) => Promise<void> | void;
}

export type SceneInstance<T extends SceneData = SceneData> = Scene<T> & T;

/**
 * A scene's lifecycle host. Two creation paths are supported:
 *
 *   - `new Scene()` — empty scene; override later or use as a stub.
 *   - `new Scene({ update() { ... } })` — typed definition object whose
 *     method bodies see `this` as `Scene<T> & T` via `ThisType<>`.
 *
 * The class is generic over the definition's own-property shape so
 * plain-object users can declare local state in the literal and access it
 * from `this` inside method bodies. For richer scenarios — private state,
 * constructor logic, stronger IntelliSense — extend the class instead.
 */
export class Scene<T extends SceneData = SceneData> {

    #app: Application | null = null;
    readonly #root = new Container();
    #stackMode: SceneStackMode = 'overlay';
    #inputMode: SceneInputMode = 'capture';

    public constructor(definition?: T & ThisType<Scene<T> & T>) {
        if (definition) {
            Object.assign(this, definition);
        }
    }

    public get app(): Application | null {
        return this.#app;
    }

    public set app(app: Application | null) {
        this.#app = app;
    }

    /**
     * Structural root container for this scene's hierarchy.
     *
     * `Scene.root` is an **ownership and traversal anchor**, not an
     * automatic render-authoritative root. The framework never calls
     * `root.render(backend)` for you. `Scene.draw(backend)` is the
     * explicit orchestration point — see {@link Scene.draw}.
     *
     * The root exists eagerly so `addChild` / `removeChild` can proxy
     * to a known container, and so transform/bounds traversal has a
     * stable parent. Selecting what to render each frame remains the
     * scene's responsibility.
     */
    public get root(): Container {
        return this.#root;
    }

    public get stackMode(): SceneStackMode {
        return this.#stackMode;
    }

    public set stackMode(mode: SceneStackMode) {
        this.#stackMode = mode;
    }

    public get inputMode(): SceneInputMode {
        return this.#inputMode;
    }

    public set inputMode(mode: SceneInputMode) {
        this.#inputMode = mode;
    }

    public addChild(child: RenderNode): this {
        this.#root.addChild(child);

        return this;
    }

    public removeChild(child: RenderNode): this {
        this.#root.removeChild(child);

        return this;
    }

    public setParticipationPolicy(policy: SceneParticipationPolicy): this {
        if (policy.mode) {
            this.#stackMode = policy.mode;
        }

        if (policy.input) {
            this.#inputMode = policy.input;
        }

        return this;
    }

    public getParticipationPolicy(): SceneParticipationPolicy {
        return {
            mode: this.#stackMode,
            input: this.#inputMode,
        };
    }

    public load(loader: Loader): Promise<void> | void {
        // override in subclass or via new Scene({ ... })
    }

    public init(loader: Loader): Promise<void> | void {
        // override in subclass or via new Scene({ ... })
    }

    public update(delta: Time): void {
        // override in subclass or via new Scene({ ... })
    }

    /**
     * Explicit per-frame rendering entry point. Override to choose
     * what gets rendered.
     *
     * The default body is intentionally empty: `Scene` does not
     * automatically traverse {@link Scene.root}. Auto-rendering the
     * full hierarchy would conflict with ExoJS's "explicit instead of
     * implicit" identity. Users decide which subtree(s) render each
     * frame — `this.root.render(backend)` is one common pattern, but
     * selective rendering (e.g. `world.render(backend)` while skipping
     * `ui` for a given frame) is equally valid and intentionally
     * supported.
     *
     * @see Scene.root for why root is structural, not render-authoritative.
     */
    public draw(backend: RenderBackend): void {
        // override in subclass or via new Scene({ ... })
    }

    public handleInput(_event: SceneInputEvent): boolean | void {
        // override in subclass or via new Scene({ ... })
    }

    public unload(loader: Loader): Promise<void> | void {
        // override in subclass or via new Scene({ ... })
    }

    public destroy(): void {
        this.#root.destroy();
        this.#app = null;
    }
}
