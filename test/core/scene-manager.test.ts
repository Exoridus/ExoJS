import { Scene } from '@/core/Scene';
import { Signal } from '@/core/Signal';
import { Time } from '@/core/Time';
import { Rectangle } from '@/math/Rectangle';
import { SceneManager } from '@/core/SceneManager';
import type { Application } from '@/core/Application';
import type { Pointer } from '@/input/Pointer';
import type { Vector } from '@/math/Vector';

interface InputManagerStub {
    readonly onKeyDown: Signal<[number]>;
    readonly onKeyUp: Signal<[number]>;
    readonly onPointerEnter: Signal<[Pointer]>;
    readonly onPointerLeave: Signal<[Pointer]>;
    readonly onPointerDown: Signal<[Pointer]>;
    readonly onPointerMove: Signal<[Pointer]>;
    readonly onPointerUp: Signal<[Pointer]>;
    readonly onPointerTap: Signal<[Pointer]>;
    readonly onPointerSwipe: Signal<[Pointer]>;
    readonly onPointerCancel: Signal<[Pointer]>;
    readonly onMouseWheel: Signal<[Vector]>;
}

const createInputManagerStub = (): InputManagerStub => ({
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
    onPointerEnter: new Signal<[Pointer]>(),
    onPointerLeave: new Signal<[Pointer]>(),
    onPointerDown: new Signal<[Pointer]>(),
    onPointerMove: new Signal<[Pointer]>(),
    onPointerUp: new Signal<[Pointer]>(),
    onPointerTap: new Signal<[Pointer]>(),
    onPointerSwipe: new Signal<[Pointer]>(),
    onPointerCancel: new Signal<[Pointer]>(),
    onMouseWheel: new Signal<[Vector]>(),
});

const createApplicationStub = (): Application & {
    inputManager: InputManagerStub;
    backend: {
        view: { getBounds: () => Rectangle; };
        draw: jest.Mock;
        stats: { culledNodes: number; };
        resetStats: jest.Mock;
    };
} => {
    const bounds = new Rectangle(0, 0, 320, 180);

    return {
        loader: {},
        inputManager: createInputManagerStub(),
        backend: {
            view: {
                getBounds: () => bounds,
            },
            draw: jest.fn().mockReturnThis(),
            stats: { culledNodes: 0 },
            resetStats: jest.fn().mockReturnThis(),
        },
    } as unknown as Application & {
        inputManager: InputManagerStub;
        backend: {
            view: { getBounds: () => Rectangle; };
            draw: jest.Mock;
            stats: { culledNodes: number; };
            resetStats: jest.Mock;
        };
    };
};

const tick = (manager: SceneManager, milliseconds = 16): void => {
    manager.update(new Time(milliseconds));
};

type SceneHooks = Partial<Pick<Scene, 'load' | 'init' | 'update' | 'draw' | 'handleInput' | 'unload'>>;

const makeScene = (hooks: SceneHooks = {}): Scene => Object.assign(new Scene(), hooks);

describe('SceneManager', () => {
    test('keeps scene unset and cleans up when load() fails', async () => {
        const manager = new SceneManager(createApplicationStub());
        const unload = jest.fn(async () => undefined);
        const scene = makeScene({
            async load() {
                throw new Error('load failed');
            },
            unload,
        });
        const destroySpy = jest.spyOn(scene, 'destroy');
        const changeSpy = jest.fn();

        manager.onChangeScene.add(changeSpy);

        await expect(manager.setScene(scene)).rejects.toThrow('load failed');
        expect(manager.scene).toBeNull();
        expect(unload).toHaveBeenCalledTimes(1);
        expect(destroySpy).toHaveBeenCalledTimes(1);
        expect(scene.app).toBeNull();
        expect(changeSpy).not.toHaveBeenCalled();
    });

    test('keeps scene unset and cleans up when init() fails', async () => {
        const manager = new SceneManager(createApplicationStub());
        const load = jest.fn(async () => undefined);
        const unload = jest.fn(async () => undefined);
        const scene = makeScene({
            load,
            async init() {
                throw new Error('init failed');
            },
            unload,
        });
        const destroySpy = jest.spyOn(scene, 'destroy');
        const changeSpy = jest.fn();

        manager.onChangeScene.add(changeSpy);

        await expect(manager.setScene(scene)).rejects.toThrow('init failed');
        expect(manager.scene).toBeNull();
        expect(load).toHaveBeenCalledTimes(1);
        expect(unload).toHaveBeenCalledTimes(1);
        expect(destroySpy).toHaveBeenCalledTimes(1);
        expect(scene.app).toBeNull();
        expect(changeSpy).not.toHaveBeenCalled();
    });

    test('surfaces both init and cleanup errors when recovery unload fails', async () => {
        const manager = new SceneManager(createApplicationStub());
        const scene = makeScene({
            async init() {
                throw new Error('init failed');
            },
            async unload() {
                throw new Error('cleanup failed');
            },
        });
        const destroySpy = jest.spyOn(scene, 'destroy');

        await expect(manager.setScene(scene)).rejects.toThrow(
            'Failed to initialize scene: init failed. Cleanup also failed: cleanup failed.',
        );
        expect(manager.scene).toBeNull();
        expect(destroySpy).toHaveBeenCalledTimes(1);
        expect(scene.app).toBeNull();
    });

    test('does not leak unhandled rejections when destroy() unload fails', async () => {
        const manager = new SceneManager(createApplicationStub());
        const unload = jest.fn(async () => {
            throw new Error('unload failed');
        });
        const scene = makeScene({
            async load() {
                // noop
            },
            async init() {
                // noop
            },
            unload,
        });
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await manager.setScene(scene);
        manager.destroy();
        await Promise.resolve();
        await Promise.resolve();

        expect(unload).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'SceneManager.destroy() failed to unload the active scene.',
            expect.any(Error),
        );
        consoleErrorSpy.mockRestore();
    });

    test('push/pop preserves underlying scene state without reload', async () => {
        const manager = new SceneManager(createApplicationStub());
        const baseLoad = jest.fn(async () => undefined);
        const baseInit = jest.fn(async () => undefined);
        const baseUpdate = jest.fn();
        const baseDraw = jest.fn();
        const baseUnload = jest.fn(async () => undefined);
        const overlayUpdate = jest.fn();
        const overlayUnload = jest.fn(async () => undefined);
        const base = makeScene({
            load: baseLoad,
            init: baseInit,
            update: baseUpdate,
            draw: baseDraw,
            unload: baseUnload,
        });
        const overlay = makeScene({
            update: overlayUpdate,
            unload: overlayUnload,
        });

        await manager.setScene(base);
        tick(manager);
        await manager.pushScene(overlay, { mode: 'modal', input: 'capture' });
        tick(manager);

        expect(baseLoad).toHaveBeenCalledTimes(1);
        expect(baseInit).toHaveBeenCalledTimes(1);
        expect(baseUpdate).toHaveBeenCalledTimes(1);
        expect(overlayUpdate).toHaveBeenCalledTimes(1);

        await manager.popScene();
        tick(manager);

        expect(baseInit).toHaveBeenCalledTimes(1);
        expect(baseUpdate).toHaveBeenCalledTimes(2);
        expect(baseUnload).toHaveBeenCalledTimes(0);
        expect(overlayUnload).toHaveBeenCalledTimes(1);
    });

    test('overlay mode keeps lower scene updating and drawing', async () => {
        const manager = new SceneManager(createApplicationStub());
        const baseUpdate = jest.fn();
        const baseDraw = jest.fn();
        const overlayUpdate = jest.fn();
        const overlayDraw = jest.fn();
        const base = makeScene({ update: baseUpdate, draw: baseDraw });
        const overlay = makeScene({ update: overlayUpdate, draw: overlayDraw });

        await manager.setScene(base);
        await manager.pushScene(overlay, { mode: 'overlay', input: 'passthrough' });
        tick(manager);

        expect(baseUpdate).toHaveBeenCalledTimes(1);
        expect(baseDraw).toHaveBeenCalledTimes(1);
        expect(overlayUpdate).toHaveBeenCalledTimes(1);
        expect(overlayDraw).toHaveBeenCalledTimes(1);
    });

    test('modal mode blocks lower updates but keeps lower drawing', async () => {
        const manager = new SceneManager(createApplicationStub());
        const baseUpdate = jest.fn();
        const baseDraw = jest.fn();
        const modalUpdate = jest.fn();
        const modalDraw = jest.fn();
        const base = makeScene({ update: baseUpdate, draw: baseDraw });
        const modal = makeScene({ update: modalUpdate, draw: modalDraw });

        await manager.setScene(base);
        await manager.pushScene(modal, { mode: 'modal', input: 'capture' });
        tick(manager);

        expect(baseUpdate).toHaveBeenCalledTimes(0);
        expect(baseDraw).toHaveBeenCalledTimes(1);
        expect(modalUpdate).toHaveBeenCalledTimes(1);
        expect(modalDraw).toHaveBeenCalledTimes(1);
    });

    test('opaque mode blocks both lower updates and lower drawing', async () => {
        const manager = new SceneManager(createApplicationStub());
        const baseUpdate = jest.fn();
        const baseDraw = jest.fn();
        const opaqueUpdate = jest.fn();
        const opaqueDraw = jest.fn();
        const base = makeScene({ update: baseUpdate, draw: baseDraw });
        const opaque = makeScene({ update: opaqueUpdate, draw: opaqueDraw });

        await manager.setScene(base);
        await manager.pushScene(opaque, { mode: 'opaque', input: 'capture' });
        tick(manager);

        expect(baseUpdate).toHaveBeenCalledTimes(0);
        expect(baseDraw).toHaveBeenCalledTimes(0);
        expect(opaqueUpdate).toHaveBeenCalledTimes(1);
        expect(opaqueDraw).toHaveBeenCalledTimes(1);
    });

    test('input routing supports capture, passthrough, and transparent top scenes', async () => {
        const app = createApplicationStub();
        const manager = new SceneManager(app);
        const baseInput = jest.fn();
        const captureInput = jest.fn();
        const passthroughInput = jest.fn();
        const transparentInput = jest.fn();
        const base = makeScene({
            handleInput: baseInput,
        });
        const capture = makeScene({
            handleInput: captureInput,
        });
        const passthrough = makeScene({
            handleInput: passthroughInput,
        });
        const transparent = makeScene({
            handleInput: transparentInput,
        });

        await manager.setScene(base);
        await manager.pushScene(capture, { input: 'capture' });
        app.inputManager.onKeyDown.dispatch(1);
        expect(captureInput).toHaveBeenCalledTimes(1);
        expect(baseInput).toHaveBeenCalledTimes(0);

        await manager.popScene();
        await manager.pushScene(passthrough, { input: 'passthrough' });
        app.inputManager.onKeyDown.dispatch(2);
        expect(passthroughInput).toHaveBeenCalledTimes(1);
        expect(baseInput).toHaveBeenCalledTimes(1);

        await manager.popScene();
        await manager.pushScene(transparent, { input: 'transparent' });
        app.inputManager.onKeyDown.dispatch(3);
        expect(transparentInput).toHaveBeenCalledTimes(0);
        expect(baseInput).toHaveBeenCalledTimes(2);
    });

    test('failed push keeps active scene stack intact', async () => {
        const manager = new SceneManager(createApplicationStub());
        const baseUnload = jest.fn(async () => undefined);
        const failedUnload = jest.fn(async () => undefined);
        const base = makeScene({ unload: baseUnload });
        const failingOverlay = makeScene({
            async init() {
                throw new Error('overlay init failed');
            },
            unload: failedUnload,
        });

        await manager.setScene(base);

        await expect(manager.pushScene(failingOverlay)).rejects.toThrow('overlay init failed');
        expect(manager.scene).toBe(base);
        expect(manager.scenes).toEqual([base]);
        expect(baseUnload).toHaveBeenCalledTimes(0);
        expect(failedUnload).toHaveBeenCalledTimes(1);
    });

    test('single-scene setScene flow still works with stack-enabled manager', async () => {
        const manager = new SceneManager(createApplicationStub());
        const firstUnload = jest.fn(async () => undefined);
        const first = makeScene({ unload: firstUnload });
        const second = makeScene({});

        await manager.setScene(first);
        await manager.setScene(second);

        expect(firstUnload).toHaveBeenCalledTimes(1);
        expect(manager.scene).toBe(second);
        expect(manager.scenes).toEqual([second]);
    });

    test('fade transition runs and completes around setScene', async () => {
        const app = createApplicationStub();
        const manager = new SceneManager(app);
        const first = makeScene({});
        const second = makeScene({});

        await manager.setScene(first);

        const transitionPromise = manager.setScene(second, {
            transition: {
                type: 'fade',
                duration: 100,
            },
        });
        let transitionSettled = false;

        void transitionPromise.then(() => {
            transitionSettled = true;
        });

        tick(manager, 50);
        expect(manager.scene).toBe(first);

        tick(manager, 60);
        for (let i = 0; i < 64 && !transitionSettled; i++) {
            await Promise.resolve();
            tick(manager, 100);
        }

        expect(transitionSettled).toBe(true);
        await expect(transitionPromise).resolves.toBe(manager);
        expect(manager.scene).toBe(second);
        expect(app.backend.draw).toHaveBeenCalled();
    });

    test('transition failure rejects and leaves manager in a valid state', async () => {
        const manager = new SceneManager(createApplicationStub());
        const first = makeScene({});
        const failing = makeScene({
            async init() {
                throw new Error('transition target failed');
            },
        });
        const fallback = makeScene({});

        await manager.setScene(first);

        const transitionPromise = manager.setScene(failing, {
            transition: {
                type: 'fade',
                duration: 60,
            },
        });

        tick(manager, 60);
        await Promise.resolve();

        await expect(transitionPromise).rejects.toThrow('transition target failed');
        expect(manager.scene).toBe(first);

        await expect(manager.setScene(fallback)).resolves.toBe(manager);
        expect(manager.scene).toBe(fallback);
    });
});
