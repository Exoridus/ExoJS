import { Signal } from './Signal';
import { Color } from './Color';
import { Mesh } from '@/rendering/mesh/Mesh';
import type { Time } from './Time';
import type { Application } from './Application';
import type { Pointer } from '@/input/Pointer';
import type { Vector } from '@/math/Vector';
import type { Scene, SceneInputEvent, SceneInputMode, SceneParticipationPolicy, SceneStackMode } from './Scene';
import type { RenderBackend } from '@/rendering/RenderBackend';

interface ResolvedSceneParticipationPolicy {
    readonly mode: SceneStackMode;
    readonly input: SceneInputMode;
}

interface SceneStackEntry {
    readonly scene: Scene;
    readonly policy: ResolvedSceneParticipationPolicy;
}

export interface FadeSceneTransition {
    type: 'fade';
    duration?: number;
    color?: Color;
}

export type SceneTransition = FadeSceneTransition;

export interface SetSceneOptions {
    transition?: SceneTransition;
}

export interface PushSceneOptions extends SceneParticipationPolicy {
    transition?: SceneTransition;
}

export interface PopSceneOptions {
    transition?: SceneTransition;
}

interface ActiveFadeTransition {
    readonly type: 'fade';
    readonly durationMs: number;
    readonly action: () => Promise<void>;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
    readonly color: Color;
    elapsedMs: number;
    phase: 'out' | 'switching' | 'in';
}

class TransitionOverlayMesh extends Mesh {
    public override render(backend: RenderBackend): this {
        if (this.visible) {
            backend.draw(this);
        }

        return this;
    }
}

const createOverlayMesh = (): TransitionOverlayMesh => new TransitionOverlayMesh({
    // 4 vertices (TL, TR, BL, BR) with 2 indexed triangles forming a screen quad.
    vertices: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
});

const defaultFadeTransitionDuration = 220;

export class SceneManager {

    private readonly _app: Application;
    private readonly _stack: Array<SceneStackEntry> = [];
    private readonly _transitionOverlay: TransitionOverlayMesh = createOverlayMesh();
    private _transition: ActiveFadeTransition | null = null;

    public readonly onChangeScene = new Signal<[Scene | null]>();
    public readonly onStartScene = new Signal<[Scene]>();
    public readonly onUpdateScene = new Signal<[Scene]>();
    public readonly onStopScene = new Signal<[Scene]>();

    public constructor(app: Application) {
        this._app = app;

        this._subscribeInputRouting();
    }

    public get scene(): Scene | null {
        return this._stack.at(-1)?.scene ?? null;
    }

    public set scene(scene: Scene | null) {
        void this.setScene(scene);
    }

    public get scenes(): ReadonlyArray<Scene> {
        return this._stack.map(entry => entry.scene);
    }

    public async setScene(scene: Scene | null, options: SetSceneOptions = {}): Promise<this> {
        await this._runWithTransition(async () => {
            if (scene === null) {
                await this._unloadAllScenes();
                this.onChangeScene.dispatch(null);

                return;
            }

            if (this.scene === scene) {
                if (this._stack.length > 1) {
                    await this._unloadCoveredScenes();
                }

                return;
            }

            if (this._stack.some((entry) => entry.scene === scene)) {
                throw new Error('Cannot set a scene that is already present in the scene stack.');
            }

            const policy = this._resolveParticipationPolicy(scene);

            await this._prepareScene(scene);
            await this._unloadAllScenes();
            this._stack.push({ scene, policy });
            this.onChangeScene.dispatch(scene);
            this.onStartScene.dispatch(scene);
        }, options.transition);

        return this;
    }

    public async pushScene(scene: Scene, options: PushSceneOptions = {}): Promise<this> {
        await this._runWithTransition(async () => {
            if (this._stack.some((entry) => entry.scene === scene)) {
                throw new Error('Cannot push a scene instance that is already present in the stack.');
            }

            const policy = this._resolveParticipationPolicy(scene, options);

            await this._prepareScene(scene);
            this._stack.push({ scene, policy });
            this.onChangeScene.dispatch(scene);
            this.onStartScene.dispatch(scene);
        }, options.transition);

        return this;
    }

    public async popScene(options: PopSceneOptions = {}): Promise<this> {
        await this._runWithTransition(async () => {
            if (this._stack.length === 0) {
                return;
            }

            const removed = this._stack.at(-1);

            if (!removed) {
                return;
            }

            await this._disposeScene(removed.scene);
            this._stack.pop();
            this.onChangeScene.dispatch(this.scene);
        }, options.transition);

        return this;
    }

    public update(delta: Time): this {
        this._advanceTransition(delta.milliseconds);

        const { updateScenes, drawScenes } = this._resolveParticipants();

        for (const scene of updateScenes) {
            scene.update(delta);
        }

        for (const scene of drawScenes) {
            scene.draw(this._app.backend);
        }

        const transitionAlpha = this._getTransitionAlpha();

        if (transitionAlpha > 0) {
            this._renderTransitionOverlay(transitionAlpha);
        }

        if (this.scene !== null) {
            this.onUpdateScene.dispatch(this.scene);
        }

        return this;
    }

    public destroy(): void {
        this._unsubscribeInputRouting();

        if (this._transition) {
            const transition = this._transition;

            this._transition = null;
            transition.color.destroy();
            transition.reject(new Error('SceneManager was destroyed while a transition was active.'));
        }

        void this._unloadAllScenesOnDestroy();

        this._transitionOverlay.destroy();
        this.onChangeScene.destroy();
        this.onStartScene.destroy();
        this.onUpdateScene.destroy();
        this.onStopScene.destroy();
    }

    private async _prepareScene(scene: Scene): Promise<void> {
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
            scene.app = null;

            if (cleanupError) {
                const initMessage = error instanceof Error ? error.message : String(error);
                const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);

                throw new Error(
                    `Failed to initialize scene: ${initMessage}. Cleanup also failed: ${cleanupMessage}.`,
                    { cause: error },
                );
            }

            throw error;
        }
    }

    private async _disposeScene(scene: Scene): Promise<void> {
        this.onStopScene.dispatch(scene);
        await scene.unload(this._app.loader);
        scene.destroy();
        scene.app = null;
    }

    private async _unloadAllScenes(): Promise<void> {
        for (let index = this._stack.length - 1; index >= 0; index--) {
            await this._disposeScene(this._stack[index].scene);
        }

        this._stack.length = 0;
    }

    private async _unloadCoveredScenes(): Promise<void> {
        if (this._stack.length <= 1) {
            return;
        }

        const activeEntry = this._stack.at(-1);

        if (!activeEntry) {
            return;
        }

        for (let index = this._stack.length - 2; index >= 0; index--) {
            await this._disposeScene(this._stack[index].scene);
        }

        this._stack.length = 0;
        this._stack.push(activeEntry);
    }

    private async _unloadAllScenesOnDestroy(): Promise<void> {
        for (let index = this._stack.length - 1; index >= 0; index--) {
            try {
                await this._disposeScene(this._stack[index].scene);
            } catch (error) {
                console.error('SceneManager.destroy() failed to unload the active scene.', error);
            }
        }

        this._stack.length = 0;
    }

    private _resolveParticipationPolicy(scene: Scene, overrides: SceneParticipationPolicy = {}): ResolvedSceneParticipationPolicy {
        const scenePolicy = scene.getParticipationPolicy();
        const mode = overrides.mode ?? scenePolicy.mode ?? 'overlay';
        const input = overrides.input ?? scenePolicy.input ?? (mode === 'overlay' ? 'passthrough' : 'capture');

        return { mode, input };
    }

    private _resolveParticipants(): { updateScenes: Array<Scene>; drawScenes: Array<Scene>; } {
        const updateScenes = new Array<Scene>();
        const drawScenes = new Array<Scene>();
        let allowBelowUpdate = true;
        let allowBelowDraw = true;

        for (let index = this._stack.length - 1; index >= 0; index--) {
            const entry = this._stack[index];

            if (allowBelowUpdate) {
                updateScenes.push(entry.scene);
            }

            if (allowBelowDraw) {
                drawScenes.push(entry.scene);
            }

            if (entry.policy.mode === 'opaque') {
                allowBelowUpdate = false;
                allowBelowDraw = false;
            } else if (entry.policy.mode === 'modal') {
                allowBelowUpdate = false;
            }
        }

        updateScenes.reverse();
        drawScenes.reverse();

        return { updateScenes, drawScenes };
    }

    private _subscribeInputRouting(): void {
        const inputManager = (this._app as Partial<Application>).inputManager as {
            onKeyDown?: { add?: (handler: (channel: number) => void) => unknown; };
            onKeyUp?: { add?: (handler: (channel: number) => void) => unknown; };
            onPointerEnter?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerLeave?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerDown?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerMove?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerUp?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerTap?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerSwipe?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerCancel?: { add?: (handler: (pointer: Pointer) => void) => unknown; };
            onMouseWheel?: { add?: (handler: (wheel: Vector) => void) => unknown; };
        };

        inputManager?.onKeyDown?.add?.(this._handleKeyDown);
        inputManager?.onKeyUp?.add?.(this._handleKeyUp);
        inputManager?.onPointerEnter?.add?.(this._handlePointerEnter);
        inputManager?.onPointerLeave?.add?.(this._handlePointerLeave);
        inputManager?.onPointerDown?.add?.(this._handlePointerDown);
        inputManager?.onPointerMove?.add?.(this._handlePointerMove);
        inputManager?.onPointerUp?.add?.(this._handlePointerUp);
        inputManager?.onPointerTap?.add?.(this._handlePointerTap);
        inputManager?.onPointerSwipe?.add?.(this._handlePointerSwipe);
        inputManager?.onPointerCancel?.add?.(this._handlePointerCancel);
        inputManager?.onMouseWheel?.add?.(this._handleMouseWheel);
    }

    private _unsubscribeInputRouting(): void {
        const inputManager = (this._app as Partial<Application>).inputManager as {
            onKeyDown?: { remove?: (handler: (channel: number) => void) => unknown; };
            onKeyUp?: { remove?: (handler: (channel: number) => void) => unknown; };
            onPointerEnter?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerLeave?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerDown?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerMove?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerUp?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerTap?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerSwipe?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onPointerCancel?: { remove?: (handler: (pointer: Pointer) => void) => unknown; };
            onMouseWheel?: { remove?: (handler: (wheel: Vector) => void) => unknown; };
        };

        inputManager?.onKeyDown?.remove?.(this._handleKeyDown);
        inputManager?.onKeyUp?.remove?.(this._handleKeyUp);
        inputManager?.onPointerEnter?.remove?.(this._handlePointerEnter);
        inputManager?.onPointerLeave?.remove?.(this._handlePointerLeave);
        inputManager?.onPointerDown?.remove?.(this._handlePointerDown);
        inputManager?.onPointerMove?.remove?.(this._handlePointerMove);
        inputManager?.onPointerUp?.remove?.(this._handlePointerUp);
        inputManager?.onPointerTap?.remove?.(this._handlePointerTap);
        inputManager?.onPointerSwipe?.remove?.(this._handlePointerSwipe);
        inputManager?.onPointerCancel?.remove?.(this._handlePointerCancel);
        inputManager?.onMouseWheel?.remove?.(this._handleMouseWheel);
    }

    private _dispatchInput(event: SceneInputEvent): void {
        for (let index = this._stack.length - 1; index >= 0; index--) {
            const entry = this._stack[index];

            if (entry.policy.input === 'transparent') {
                continue;
            }

            const handled = entry.scene.handleInput(event);

            if (handled === false || entry.policy.input === 'capture') {
                break;
            }
        }
    }

    private readonly _handleKeyDown = (channel: number): void => {
        this._dispatchInput({ type: 'keyDown', channel });
    };

    private readonly _handleKeyUp = (channel: number): void => {
        this._dispatchInput({ type: 'keyUp', channel });
    };

    private readonly _handlePointerEnter = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerEnter', pointer });
    };

    private readonly _handlePointerLeave = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerLeave', pointer });
    };

    private readonly _handlePointerDown = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerDown', pointer });
    };

    private readonly _handlePointerMove = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerMove', pointer });
    };

    private readonly _handlePointerUp = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerUp', pointer });
    };

    private readonly _handlePointerTap = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerTap', pointer });
    };

    private readonly _handlePointerSwipe = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerSwipe', pointer });
    };

    private readonly _handlePointerCancel = (pointer: Pointer): void => {
        this._dispatchInput({ type: 'pointerCancel', pointer });
    };

    private readonly _handleMouseWheel = (wheel: Vector): void => {
        this._dispatchInput({ type: 'mouseWheel', wheel });
    };

    private async _runWithTransition(action: () => Promise<void>, transition?: SceneTransition): Promise<void> {
        if (!transition || transition.type !== 'fade') {
            await action();

            return;
        }

        if (this._transition) {
            throw new Error('Scene transition is already in progress.');
        }

        const durationMs = Math.max(0, transition.duration ?? defaultFadeTransitionDuration);

        if (durationMs === 0) {
            await action();

            return;
        }

        await new Promise<void>((resolve, reject) => {
            this._transition = {
                type: 'fade',
                durationMs,
                action,
                resolve,
                reject,
                color: (transition.color ?? Color.black).clone(),
                elapsedMs: 0,
                phase: 'out',
            };
        });
    }

    private _advanceTransition(deltaMs: number): void {
        if (!this._transition) {
            return;
        }

        if (this._transition.phase === 'out') {
            this._transition.elapsedMs = Math.min(
                this._transition.durationMs,
                this._transition.elapsedMs + Math.max(0, deltaMs),
            );

            if (this._transition.elapsedMs >= this._transition.durationMs) {
                this._transition.phase = 'switching';
                void this._executeTransitionAction();
            }

            return;
        }

        if (this._transition.phase === 'in') {
            this._transition.elapsedMs = Math.min(
                this._transition.durationMs,
                this._transition.elapsedMs + Math.max(0, deltaMs),
            );

            if (this._transition.elapsedMs >= this._transition.durationMs) {
                this._finishTransition();
            }
        }
    }

    private async _executeTransitionAction(): Promise<void> {
        const transition = this._transition;

        if (!transition || transition.phase !== 'switching') {
            return;
        }

        try {
            await transition.action();
        } catch (error) {
            if (this._transition === transition) {
                this._transition = null;
                transition.color.destroy();
                transition.reject(error);
            }

            return;
        }

        if (this._transition !== transition) {
            return;
        }

        transition.phase = 'in';
        transition.elapsedMs = 0;
    }

    private _finishTransition(): void {
        if (!this._transition) {
            return;
        }

        const transition = this._transition;

        this._transition = null;
        transition.color.destroy();
        transition.resolve();
    }

    private _getTransitionAlpha(): number {
        if (!this._transition) {
            return 0;
        }

        if (this._transition.phase === 'switching') {
            return 1;
        }

        const progress = this._transition.durationMs > 0
            ? this._transition.elapsedMs / this._transition.durationMs
            : 1;

        return this._transition.phase === 'out' ? progress : 1 - progress;
    }

    private _renderTransitionOverlay(alpha: number): void {
        const transition = this._transition;
        const overlayColor = transition ? transition.color : Color.black;
        const backend = this._app.backend;
        const bounds = backend.view.getBounds();
        const overlay = this._transitionOverlay;
        const vertices = overlay.vertices;

        vertices[0] = bounds.left;
        vertices[1] = bounds.top;
        vertices[2] = bounds.right;
        vertices[3] = bounds.top;
        vertices[4] = bounds.left;
        vertices[5] = bounds.bottom;
        vertices[6] = bounds.right;
        vertices[7] = bounds.bottom;

        overlay.tint.set(overlayColor.r, overlayColor.g, overlayColor.b, Math.max(0, Math.min(1, alpha)));
        overlay.render(backend);
    }
}
