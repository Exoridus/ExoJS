const setNavigatorGpu = (gpu: unknown): (() => void) => {
    const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    const navigatorWithGpu = navigator as Navigator & Partial<Record<'gpu', unknown>>;

    Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: gpu,
    });

    return (): void => {
        if (previousGpu) {
            Object.defineProperty(navigator, 'gpu', previousGpu);
        } else {
            Reflect.deleteProperty(navigatorWithGpu, 'gpu');
        }
    };
};

interface ApplicationTestHarness {
    readonly Application: typeof import('@/core/Application').Application;
    readonly ApplicationStatus: typeof import('@/core/Application').ApplicationStatus;
    readonly webglManager: {
        initialize: jest.Mock;
        flush: jest.Mock;
        resize: jest.Mock;
        destroy: jest.Mock;
        resetStats: jest.Mock;
        stats: { frameTimeMs: number; };
        renderTarget: { setView: jest.Mock };
    };
    readonly webgpuManager: {
        initialize: jest.Mock;
        flush: jest.Mock;
        resize: jest.Mock;
        destroy: jest.Mock;
        resetStats: jest.Mock;
        stats: { frameTimeMs: number; };
        renderTarget: { setView: jest.Mock };
    };
    readonly BackendMock: jest.Mock;
    readonly WebGpuBackendMock: jest.Mock;
    readonly sceneManager: {
        update: jest.Mock;
        setScene: jest.Mock;
        destroy: jest.Mock;
    };
}

const loadApplicationHarness = (options: {
    webgpuInitialize?: jest.Mock;
    webglInitialize?: jest.Mock;
} = {}): ApplicationTestHarness => {
    const webglManager = {
        initialize: options.webglInitialize ?? jest.fn().mockResolvedValue(undefined),
        flush: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
        resetStats: jest.fn().mockReturnThis(),
        stats: { frameTimeMs: 0 },
        renderTarget: { setView: jest.fn() },
    };
    const webgpuManager = {
        initialize: options.webgpuInitialize ?? jest.fn().mockResolvedValue(undefined),
        flush: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
        resetStats: jest.fn().mockReturnThis(),
        stats: { frameTimeMs: 0 },
        renderTarget: { setView: jest.fn() },
    };
    const sceneManager = {
        update: jest.fn(),
        setScene: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
    };
    const inputManager = {
        update: jest.fn(),
        destroy: jest.fn(),
    };
    const loader = {
        destroy: jest.fn(),
    };
    const BackendMock = jest.fn(() => webglManager);
    const WebGpuBackendMock = jest.fn(() => webgpuManager);
    let Application!: typeof import('@/core/Application').Application;
    let ApplicationStatus!: typeof import('@/core/Application').ApplicationStatus;

    jest.resetModules();
    jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
        WebGl2Backend: BackendMock,
    }));
    jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
        WebGpuBackend: WebGpuBackendMock,
    }));
    jest.doMock('@/resources/Loader', () => ({
        Loader: jest.fn(() => loader),
    }));
    jest.doMock('@/input/InputManager', () => ({
        InputManager: jest.fn(() => inputManager),
    }));
    jest.doMock('@/core/SceneManager', () => ({
        SceneManager: jest.fn(() => sceneManager),
    }));

    jest.isolateModules(() => {
        const module = require('@/core/Application') as typeof import('@/core/Application');
        Application = module.Application;
        ApplicationStatus = module.ApplicationStatus;
    });

    return {
        Application,
        ApplicationStatus,
        webglManager,
        webgpuManager,
        BackendMock,
        WebGpuBackendMock,
        sceneManager,
    };
};

describe('Application', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    test('update flushes renderer once per frame while running', () => {
        const { Application, ApplicationStatus } = loadApplicationHarness();
        const app = Object.create(Application.prototype) as import('@/core/Application').Application;
        const rawApp = app as unknown as Record<string, unknown>;
        const inputManager = { update: jest.fn() };
        const tweens = { update: jest.fn() };
        const sceneManager = { update: jest.fn() };
        const viewUpdate = jest.fn();
        const backend = {
            flush: jest.fn(),
            resetStats: jest.fn().mockReturnThis(),
            stats: { frameTimeMs: 0 },
            view: { update: viewUpdate },
        };
        const frameClock = {
            elapsedTime: { milliseconds: 16, seconds: 0.016 },
            restart: jest.fn(),
        };

        rawApp['_status'] = ApplicationStatus.Running;
        rawApp['inputManager'] = inputManager;
        rawApp['tweens'] = tweens;
        rawApp['sceneManager'] = sceneManager;
        rawApp['_backend'] = backend;
        rawApp['_frameClock'] = frameClock;
        rawApp['_updateHandler'] = jest.fn();
        rawApp['_frameCount'] = 0;

        const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        app.update();

        expect(inputManager.update).toHaveBeenCalledTimes(1);
        expect(sceneManager.update).toHaveBeenCalledTimes(1);
        expect(viewUpdate).toHaveBeenCalledWith(16);
        expect(backend.resetStats).toHaveBeenCalledTimes(1);
        expect(backend.flush).toHaveBeenCalledTimes(1);
        expect(backend.stats.frameTimeMs).toBeGreaterThanOrEqual(0);
        expect(frameClock.restart).toHaveBeenCalledTimes(1);
        expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    test('defaults to WebGPU when available', () => {
        const restoreGpu = setNavigatorGpu({});

        try {
            const { Application, BackendMock, WebGpuBackendMock } = loadApplicationHarness();

            new Application({
                canvas: document.createElement('canvas'),
            });

            expect(WebGpuBackendMock).toHaveBeenCalledTimes(1);
            expect(BackendMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
        }
    });

    test('defaults to WebGL2 when WebGPU is unavailable', () => {
        const restoreGpu = setNavigatorGpu(undefined);

        try {
            const { Application, BackendMock, WebGpuBackendMock } = loadApplicationHarness();

            new Application({
                canvas: document.createElement('canvas'),
            });

            expect(BackendMock).toHaveBeenCalledTimes(1);
            expect(WebGpuBackendMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
        }
    });

    test('explicit webgl2 selection still bypasses WebGPU', () => {
        const restoreGpu = setNavigatorGpu({});

        try {
            const { Application, BackendMock, WebGpuBackendMock } = loadApplicationHarness();

            new Application({
                canvas: document.createElement('canvas'),
                backend: { type: 'webgl2' },
            });

            expect(BackendMock).toHaveBeenCalledTimes(1);
            expect(WebGpuBackendMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
        }
    });

    test('auto backend falls back to WebGL2 when WebGPU initialization fails', async () => {
        const restoreGpu = setNavigatorGpu({});
        const webgpuError = new Error('webgpu failed');
        const webgpuInitialize = jest.fn().mockRejectedValue(webgpuError);
        const webglInitialize = jest.fn().mockResolvedValue(undefined);
        const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        try {
            const {
                Application,
                webglManager,
                webgpuManager,
                BackendMock,
                WebGpuBackendMock,
                sceneManager,
            } = loadApplicationHarness({ webgpuInitialize, webglInitialize });
            const app = new Application({
                canvas: document.createElement('canvas'),
            });

            await app.start({} as import('@/core/Scene').Scene);

            expect(WebGpuBackendMock).toHaveBeenCalledTimes(1);
            expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
            expect(webgpuManager.destroy).toHaveBeenCalledTimes(1);
            expect(BackendMock).toHaveBeenCalledTimes(1);
            expect(webglManager.initialize).toHaveBeenCalledTimes(1);
            expect(sceneManager.setScene).toHaveBeenCalledTimes(1);
            expect(app.backend).toBe(webglManager);
        } finally {
            restoreGpu();
            rafSpy.mockRestore();
        }
    });

    test('explicit webgpu selection still fails instead of falling back', async () => {
        const restoreGpu = setNavigatorGpu({});
        const webgpuError = new Error('webgpu failed');
        const webgpuInitialize = jest.fn().mockRejectedValue(webgpuError);
        const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        try {
            const {
                Application,
                webgpuManager,
                BackendMock,
            } = loadApplicationHarness({ webgpuInitialize });
            const app = new Application({
                canvas: document.createElement('canvas'),
                backend: { type: 'webgpu' },
            });

            await expect(app.start({} as import('@/core/Scene').Scene)).rejects.toThrow(webgpuError);
            expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
            expect(webgpuManager.destroy).not.toHaveBeenCalled();
            expect(BackendMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
            rafSpy.mockRestore();
        }
    });

    test('backend exposes a renderTarget on both backend paths', () => {
        const restoreGpu = setNavigatorGpu({});

        try {
            const { Application } = loadApplicationHarness();
            const webgpuApp = new Application({
                canvas: document.createElement('canvas'),
                backend: { type: 'webgpu' },
            });
            const webglApp = new Application({
                canvas: document.createElement('canvas'),
                backend: { type: 'webgl2' },
            });

            expect(webgpuApp.backend.renderTarget).toBeDefined();
            expect(typeof webgpuApp.backend.renderTarget.setView).toBe('function');
            expect(webglApp.backend.renderTarget).toBeDefined();
            expect(typeof webglApp.backend.renderTarget.setView).toBe('function');
        } finally {
            restoreGpu();
        }
    });

    test('stop() catches async scene teardown failures instead of leaking rejections', async () => {
        const { Application, ApplicationStatus } = loadApplicationHarness();
        const app = Object.create(Application.prototype) as import('@/core/Application').Application;
        const rawApp = app as unknown as Record<string, unknown>;
        const sceneTeardownError = new Error('scene teardown failed');
        const sceneManager = {
            setScene: jest.fn().mockRejectedValue(sceneTeardownError),
        };
        const activeClock = { stop: jest.fn() };
        const frameClock = { stop: jest.fn() };
        const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        rawApp['_status'] = ApplicationStatus.Running;
        rawApp['_frameRequest'] = 99;
        rawApp['sceneManager'] = sceneManager;
        rawApp['_activeClock'] = activeClock;
        rawApp['_frameClock'] = frameClock;

        app.stop();
        await Promise.resolve();

        expect(sceneManager.setScene).toHaveBeenCalledWith(null);
        expect(cancelSpy).toHaveBeenCalledWith(99);
        expect(activeClock.stop).toHaveBeenCalledTimes(1);
        expect(frameClock.stop).toHaveBeenCalledTimes(1);
        expect(app.status).toBe(ApplicationStatus.Stopped);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Application.stop() failed to unload the active scene.',
            sceneTeardownError,
        );

        cancelSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });
});
