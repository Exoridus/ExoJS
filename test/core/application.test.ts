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

interface IApplicationTestHarness {
    readonly Application: typeof import('core/Application').Application;
    readonly ApplicationStatus: typeof import('core/Application').ApplicationStatus;
    readonly webglManager: {
        initialize: jest.Mock;
        display: jest.Mock;
        resize: jest.Mock;
        destroy: jest.Mock;
        renderTarget: { setView: jest.Mock };
    };
    readonly webgpuManager: {
        initialize: jest.Mock;
        display: jest.Mock;
        resize: jest.Mock;
        destroy: jest.Mock;
        renderTarget: { setView: jest.Mock };
    };
    readonly RenderManagerMock: jest.Mock;
    readonly WebGpuRenderManagerMock: jest.Mock;
    readonly sceneManager: {
        update: jest.Mock;
        setScene: jest.Mock;
        destroy: jest.Mock;
    };
}

const loadApplicationHarness = (options: {
    webgpuInitialize?: jest.Mock;
    webglInitialize?: jest.Mock;
} = {}): IApplicationTestHarness => {
    const webglManager = {
        initialize: options.webglInitialize ?? jest.fn().mockResolvedValue(undefined),
        display: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
        renderTarget: { setView: jest.fn() },
    };
    const webgpuManager = {
        initialize: options.webgpuInitialize ?? jest.fn().mockResolvedValue(undefined),
        display: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
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
    const RenderManagerMock = jest.fn(() => webglManager);
    const WebGpuRenderManagerMock = jest.fn(() => webgpuManager);
    let Application!: typeof import('core/Application').Application;
    let ApplicationStatus!: typeof import('core/Application').ApplicationStatus;

    jest.resetModules();
    jest.doMock('rendering/RenderManager', () => ({
        RenderManager: RenderManagerMock,
    }));
    jest.doMock('rendering/WebGpuRenderManager', () => ({
        WebGpuRenderManager: WebGpuRenderManagerMock,
    }));
    jest.doMock('resources/Loader', () => ({
        Loader: jest.fn(() => loader),
    }));
    jest.doMock('input/InputManager', () => ({
        InputManager: jest.fn(() => inputManager),
    }));
    jest.doMock('core/SceneManager', () => ({
        SceneManager: jest.fn(() => sceneManager),
    }));

    jest.isolateModules(() => {
        const module = require('core/Application') as typeof import('core/Application');
        Application = module.Application;
        ApplicationStatus = module.ApplicationStatus;
    });

    return {
        Application,
        ApplicationStatus,
        webglManager,
        webgpuManager,
        RenderManagerMock,
        WebGpuRenderManagerMock,
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
        const app = Object.create(Application.prototype) as import('core/Application').Application;
        const rawApp = app as unknown as Record<string, unknown>;
        const inputManager = { update: jest.fn() };
        const sceneManager = { update: jest.fn() };
        const renderManager = { display: jest.fn() };
        const frameClock = {
            elapsedTime: { milliseconds: 16 },
            restart: jest.fn(),
        };

        rawApp['_status'] = ApplicationStatus.running;
        rawApp['inputManager'] = inputManager;
        rawApp['sceneManager'] = sceneManager;
        rawApp['_renderManager'] = renderManager;
        rawApp['_frameClock'] = frameClock;
        rawApp['_updateHandler'] = jest.fn();
        rawApp['_frameCount'] = 0;

        const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        app.update();

        expect(inputManager.update).toHaveBeenCalledTimes(1);
        expect(sceneManager.update).toHaveBeenCalledTimes(1);
        expect(renderManager.display).toHaveBeenCalledTimes(1);
        expect(frameClock.restart).toHaveBeenCalledTimes(1);
        expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    test('defaults to WebGPU when available', () => {
        const restoreGpu = setNavigatorGpu({});

        try {
            const { Application, RenderManagerMock, WebGpuRenderManagerMock } = loadApplicationHarness();

            new Application({
                canvas: document.createElement('canvas'),
            });

            expect(WebGpuRenderManagerMock).toHaveBeenCalledTimes(1);
            expect(RenderManagerMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
        }
    });

    test('defaults to WebGL2 when WebGPU is unavailable', () => {
        const restoreGpu = setNavigatorGpu(undefined);

        try {
            const { Application, RenderManagerMock, WebGpuRenderManagerMock } = loadApplicationHarness();

            new Application({
                canvas: document.createElement('canvas'),
            });

            expect(RenderManagerMock).toHaveBeenCalledTimes(1);
            expect(WebGpuRenderManagerMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
        }
    });

    test('explicit webgl2 selection still bypasses WebGPU', () => {
        const restoreGpu = setNavigatorGpu({});

        try {
            const { Application, RenderManagerMock, WebGpuRenderManagerMock } = loadApplicationHarness();

            new Application({
                canvas: document.createElement('canvas'),
                backend: { type: 'webgl2' },
            });

            expect(RenderManagerMock).toHaveBeenCalledTimes(1);
            expect(WebGpuRenderManagerMock).not.toHaveBeenCalled();
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
                RenderManagerMock,
                WebGpuRenderManagerMock,
                sceneManager,
            } = loadApplicationHarness({ webgpuInitialize, webglInitialize });
            const app = new Application({
                canvas: document.createElement('canvas'),
            });

            await app.start({} as import('core/Scene').Scene);

            expect(WebGpuRenderManagerMock).toHaveBeenCalledTimes(1);
            expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
            expect(webgpuManager.destroy).toHaveBeenCalledTimes(1);
            expect(RenderManagerMock).toHaveBeenCalledTimes(1);
            expect(webglManager.initialize).toHaveBeenCalledTimes(1);
            expect(sceneManager.setScene).toHaveBeenCalledTimes(1);
            expect(app.renderManager).toBe(webglManager);
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
                RenderManagerMock,
            } = loadApplicationHarness({ webgpuInitialize });
            const app = new Application({
                canvas: document.createElement('canvas'),
                backend: { type: 'webgpu' },
            });

            await expect(app.start({} as import('core/Scene').Scene)).rejects.toThrow(webgpuError);
            expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
            expect(webgpuManager.destroy).not.toHaveBeenCalled();
            expect(RenderManagerMock).not.toHaveBeenCalled();
        } finally {
            restoreGpu();
            rafSpy.mockRestore();
        }
    });

    test('renderManager exposes a renderTarget on both backend paths', () => {
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

            expect(webgpuApp.renderManager.renderTarget).toBeDefined();
            expect(typeof webgpuApp.renderManager.renderTarget.setView).toBe('function');
            expect(webglApp.renderManager.renderTarget).toBeDefined();
            expect(typeof webglApp.renderManager.renderTarget.setView).toBe('function');
        } finally {
            restoreGpu();
        }
    });
});
