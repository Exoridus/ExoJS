import { Scene } from 'core/Scene';
import { SceneManager } from 'core/SceneManager';
import type { Application } from 'core/Application';

const createApplicationStub = (): Application => ({
    loader: {},
    renderManager: {},
} as unknown as Application);

describe('SceneManager', () => {
    test('keeps scene unset and cleans up when load() fails', async () => {
        const manager = new SceneManager(createApplicationStub());
        const unload = jest.fn(async () => undefined);
        const scene = Scene.create({
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
        const scene = Scene.create({
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
        const scene = Scene.create({
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
        const scene = Scene.create({
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
});
