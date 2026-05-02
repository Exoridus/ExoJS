import { DebugOverlay } from '@/debug/DebugOverlay';
import type { Application } from '@/core/Application';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeBackend = () => ({
    stats: { frameTimeMs: 0, drawCalls: 0, culledNodes: 0 },
});

const makeSceneManager = (root?: object) => ({
    scene: root
        ? { root }
        : null,
});

const makeInputManager = (inCanvas = false) => ({
    pointersInCanvas: inCanvas,
});

const makeInteraction = (hovered: object | null = null) => ({
    getHoveredNode: jest.fn().mockReturnValue(hovered),
});

const makeCanvas = () => {
    const canvas = document.createElement('canvas');
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        top: 10, left: 20, width: 800, height: 600,
        right: 820, bottom: 610, x: 20, y: 10,
        toJSON: () => ({}),
    } as DOMRect);

    return canvas;
};

const makeApp = (overrides: Partial<{
    sceneRoot: object;
    inCanvas: boolean;
    hovered: object | null;
}> = {}): Application => ({
    canvas: makeCanvas(),
    backend: makeBackend(),
    sceneManager: makeSceneManager(overrides.sceneRoot),
    inputManager: makeInputManager(overrides.inCanvas ?? false),
    interaction: makeInteraction(overrides.hovered ?? null),
} as unknown as Application);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DebugOverlay', () => {
    afterEach(() => {
        // Clean up any elements added to body during tests.
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    test('show() creates a DOM element and appends it to document.body', () => {
        const overlay = new DebugOverlay(makeApp());

        expect(overlay.visible).toBe(false);
        expect(document.body.childElementCount).toBe(0);

        overlay.show();

        expect(overlay.visible).toBe(true);
        expect(document.body.childElementCount).toBe(1);
    });

    test('hide() removes the DOM element and sets visible to false', () => {
        const overlay = new DebugOverlay(makeApp());

        overlay.show();
        expect(overlay.visible).toBe(true);
        expect(document.body.childElementCount).toBe(1);

        overlay.hide();
        expect(overlay.visible).toBe(false);
        expect(document.body.childElementCount).toBe(0);
    });

    test('toggle() flips visibility state', () => {
        const overlay = new DebugOverlay(makeApp());

        overlay.toggle();
        expect(overlay.visible).toBe(true);

        overlay.toggle();
        expect(overlay.visible).toBe(false);

        overlay.toggle();
        expect(overlay.visible).toBe(true);
    });

    test('update() while not visible is a no-op (no DOM mutations)', () => {
        const overlay = new DebugOverlay(makeApp());
        const appendSpy = jest.spyOn(document.body, 'appendChild');

        overlay.update();

        expect(appendSpy).not.toHaveBeenCalled();
        expect(document.body.childElementCount).toBe(0);
    });

    test('update() while visible writes stats text content to element', () => {
        const app = makeApp();
        const overlay = new DebugOverlay(app);

        overlay.show();
        overlay.update();

        const el = document.body.firstElementChild as HTMLElement;

        expect(el).not.toBeNull();
        expect(el.textContent).toBeTruthy();
        expect(el.textContent!.length).toBeGreaterThan(0);
        expect(el.textContent).toContain('FPS');
    });

    test('update() text contains all expected stat labels', () => {
        const app = makeApp();
        const overlay = new DebugOverlay(app);

        overlay.show();
        overlay.update();

        const text = (document.body.firstElementChild as HTMLElement).textContent ?? '';

        expect(text).toContain('FPS');
        expect(text).toContain('Frame time');
        expect(text).toContain('Draw calls');
        expect(text).toContain('Culled nodes');
        expect(text).toContain('Node count');
        expect(text).toContain('Active pointers');
        expect(text).toContain('Hovered');
    });

    test('destroy() removes DOM element and prevents future show()', () => {
        const overlay = new DebugOverlay(makeApp());

        overlay.show();
        expect(document.body.childElementCount).toBe(1);

        overlay.destroy();
        expect(document.body.childElementCount).toBe(0);
        expect(overlay.visible).toBe(false);

        // show() after destroy() should be a no-op.
        overlay.show();
        expect(document.body.childElementCount).toBe(0);
        expect(overlay.visible).toBe(false);
    });

    test('show() re-appends element after hide() without recreating it', () => {
        const app = makeApp();
        const overlay = new DebugOverlay(app);

        overlay.show();
        const firstEl = document.body.firstElementChild;

        overlay.hide();
        overlay.show();
        const secondEl = document.body.firstElementChild;

        // Same element instance reused.
        expect(firstEl).toBe(secondEl);
    });

    test('Application auto-instantiates app.debug as a DebugOverlay', () => {
        jest.resetModules();
        jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
            WebGl2Backend: jest.fn(() => ({
                initialize: jest.fn().mockResolvedValue(undefined),
                flush: jest.fn(),
                resize: jest.fn(),
                destroy: jest.fn(),
                resetStats: jest.fn().mockReturnThis(),
                stats: { frameTimeMs: 0 },
                renderTarget: { setView: jest.fn() },
            })),
        }));
        jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
            WebGpuBackend: jest.fn(() => ({
                initialize: jest.fn().mockResolvedValue(undefined),
            })),
        }));
        jest.doMock('@/resources/Loader', () => ({
            Loader: jest.fn(() => ({ destroy: jest.fn() })),
        }));
        jest.doMock('@/input/InputManager', () => ({
            InputManager: jest.fn(() => ({ update: jest.fn(), destroy: jest.fn() })),
        }));
        jest.doMock('@/input/InteractionManager', () => ({
            InteractionManager: jest.fn(() => ({
                update: jest.fn(),
                destroy: jest.fn(),
                getHoveredNode: jest.fn().mockReturnValue(null),
            })),
        }));
        jest.doMock('@/core/SceneManager', () => ({
            SceneManager: jest.fn(() => ({
                update: jest.fn(),
                setScene: jest.fn().mockResolvedValue(undefined),
                destroy: jest.fn(),
                scene: null,
            })),
        }));

        let Application!: typeof import('@/core/Application').Application;

        jest.isolateModules(() => {
            const mod = require('@/core/Application') as typeof import('@/core/Application');
            Application = mod.Application;
        });

        const app = new Application({ canvas: document.createElement('canvas') });

        expect(app.debug).toBeDefined();
        expect(typeof app.debug.show).toBe('function');
        expect(typeof app.debug.hide).toBe('function');
        expect(typeof app.debug.toggle).toBe('function');
        expect(typeof app.debug.update).toBe('function');
        expect(typeof app.debug.destroy).toBe('function');

        jest.resetModules();
    });
});
