/**
 * Tests for Application.onFrame signal (added in 0.6.17).
 */

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------

interface OnFrameTestHarness {
    readonly Application: typeof import('@/core/Application').Application;
    readonly ApplicationStatus: typeof import('@/core/Application').ApplicationStatus;
    readonly sceneManager: { update: jest.Mock; setScene: jest.Mock; destroy: jest.Mock; };
    readonly backend: {
        flush: jest.Mock;
        resetStats: jest.Mock;
        stats: { frameTimeMs: number; };
        view: object;
        setView: jest.Mock;
    };
}

const loadOnFrameHarness = (): OnFrameTestHarness => {
    const backend = {
        initialize: jest.fn().mockResolvedValue(undefined),
        flush: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
        resetStats: jest.fn().mockReturnThis(),
        stats: { frameTimeMs: 0 },
        renderTarget: { setView: jest.fn() },
        view: {},
        setView: jest.fn().mockReturnThis(),
    };
    const sceneManager = {
        update: jest.fn(),
        setScene: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
    };
    // Plain object that satisfies the onKeyDown Signal shape needed by DebugOverlay
    // (Application itself doesn't use onKeyDown in its constructor, so a minimal stub suffices).
    const onKeyDown = { add: jest.fn(), remove: jest.fn(), dispatch: jest.fn(), destroy: jest.fn(), bindings: [] };

    let Application!: typeof import('@/core/Application').Application;
    let ApplicationStatus!: typeof import('@/core/Application').ApplicationStatus;

    jest.resetModules();

    jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
        WebGl2Backend: jest.fn(() => backend),
    }));
    jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
        WebGpuBackend: jest.fn(() => backend),
    }));
    jest.doMock('@/resources/Loader', () => ({
        Loader: jest.fn(() => ({ destroy: jest.fn() })),
    }));
    jest.doMock('@/input/InputManager', () => ({
        InputManager: jest.fn(() => ({ update: jest.fn(), destroy: jest.fn(), onKeyDown })),
    }));
    jest.doMock('@/input/InteractionManager', () => ({
        InteractionManager: jest.fn(() => ({
            update: jest.fn(),
            destroy: jest.fn(),
            getHoveredNode: jest.fn().mockReturnValue(null),
        })),
    }));
    jest.doMock('@/core/SceneManager', () => ({
        SceneManager: jest.fn(() => sceneManager),
    }));

    jest.isolateModules(() => {
        const mod = require('@/core/Application') as typeof import('@/core/Application');

        Application = mod.Application;
        ApplicationStatus = mod.ApplicationStatus;
    });

    return { Application, ApplicationStatus, sceneManager, backend };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Application.onFrame', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    test('app.onFrame exists and has Signal-shaped API (add / remove / dispatch / bindings)', () => {
        const { Application } = loadOnFrameHarness();
        const app = new Application({ canvas: document.createElement('canvas') });

        expect(app.onFrame).toBeDefined();
        expect(typeof app.onFrame.add).toBe('function');
        expect(typeof app.onFrame.remove).toBe('function');
        expect(typeof app.onFrame.dispatch).toBe('function');
        expect(Array.isArray(app.onFrame.bindings)).toBe(true);

        app.destroy();
    });

    test('app.update() dispatches onFrame after sceneManager.update and before backend.flush', () => {
        const { Application, ApplicationStatus } = loadOnFrameHarness();
        const app = Object.create(Application.prototype) as import('@/core/Application').Application;
        const rawApp = app as unknown as Record<string, unknown>;

        const callOrder: Array<string> = [];
        const sceneManager = {
            update: jest.fn(() => { callOrder.push('sceneManager.update'); }),
        };

        // Use the real Signal class loaded via isolateModules from the harness.
        // Since we already called loadOnFrameHarness which called resetModules, we
        // need a fresh require here to get a compatible Signal.
        let Signal!: typeof import('@/core/Signal').Signal;

        jest.isolateModules(() => {
            Signal = (require('@/core/Signal') as typeof import('@/core/Signal')).Signal;
        });

        const onFrame = new Signal<[import('@/core/Time').Time]>();

        onFrame.add(() => { callOrder.push('onFrame.dispatch'); });

        const backend = {
            flush: jest.fn(() => { callOrder.push('backend.flush'); }),
            resetStats: jest.fn().mockReturnThis(),
            stats: { frameTimeMs: 0 },
            view: { update: jest.fn() },
        };

        rawApp['_status'] = ApplicationStatus.Running;
        rawApp['inputManager'] = { update: jest.fn() };
        rawApp['interaction'] = { update: jest.fn() };
        rawApp['tweens'] = { update: jest.fn() };
        rawApp['sceneManager'] = sceneManager;
        rawApp['_backend'] = backend;
        rawApp['_frameClock'] = { elapsedTime: { milliseconds: 16, seconds: 0.016 }, restart: jest.fn() };
        rawApp['_updateHandler'] = jest.fn();
        rawApp['_frameCount'] = 0;
        rawApp['onFrame'] = onFrame;

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        app.update();

        expect(callOrder).toEqual(['sceneManager.update', 'onFrame.dispatch', 'backend.flush']);
    });

    test('app.destroy() destroys the onFrame signal (bindings cleared)', () => {
        const { Application } = loadOnFrameHarness();
        const app = new Application({ canvas: document.createElement('canvas') });

        const handler = jest.fn();

        app.onFrame.add(handler);
        expect(app.onFrame.bindings.length).toBeGreaterThan(0);

        app.destroy();

        expect(app.onFrame.bindings.length).toBe(0);
    });
});
