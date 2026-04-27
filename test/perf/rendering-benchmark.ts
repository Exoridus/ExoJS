import { performance } from 'node:perf_hooks';

import { RenderBackendType } from '../../src/rendering/RenderBackendType';
import { RenderTarget } from '../../src/rendering/RenderTarget';
import { createRenderStats, resetRenderStats } from '../../src/rendering/RenderStats';
import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import { RenderTexture } from '../../src/rendering/texture/RenderTexture';
import type { SceneRenderRuntime } from '../../src/rendering/SceneRenderRuntime';

interface BenchmarkScenario {
    readonly name: string;
    readonly root: Container;
    beforeFrame(frame: number, runtime: SceneRenderRuntime): void;
}

interface BenchmarkResult {
    readonly scenario: string;
    readonly frames: number;
    readonly nodeCount: number;
    readonly avgFrameMs: number;
    readonly avgDrawn: number;
    readonly avgCulled: number;
}

const frameCount = 240;
const viewportWidth = 800;
const viewportHeight = 600;

const createRuntime = (): SceneRenderRuntime => {
    const renderTarget = new RenderTarget(viewportWidth, viewportHeight, true);
    const stats = createRenderStats();

    return {
        backendType: RenderBackendType.WebGl2,
        stats,
        renderTarget,
        get view() {
            return renderTarget.view;
        },
        async initialize() {
            return this;
        },
        resetStats() {
            resetRenderStats(stats);

            return this;
        },
        clear() {
            return this;
        },
        resize(width: number, height: number) {
            renderTarget.resize(width, height);

            return this;
        },
        setView(view) {
            renderTarget.setView(view);

            return this;
        },
        setRenderTarget() {
            return this;
        },
        pushScissorRect() {
            return this;
        },
        popScissorRect() {
            return this;
        },
        composeWithAlphaMask() {
            return this;
        },
        acquireRenderTexture(width: number, height: number) {
            return new RenderTexture(width, height);
        },
        releaseRenderTexture(texture: RenderTexture) {
            texture.destroy();

            return this;
        },
        draw() {
            stats.submittedNodes++;

            return this;
        },
        execute() {
            return this;
        },
        flush() {
            return this;
        },
        destroy() {
            renderTarget.destroy();
        },
    };
};

const createNode = (x: number, y: number, size = 16): Drawable => {
    const node = new Drawable();

    node.getLocalBounds().set(0, 0, size, size);
    node.setPosition(x, y);

    return node;
};

const createGridScene = (columns: number, rows: number, spacing: number, offsetX = 0, offsetY = 0): Container => {
    const root = new Container();

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            root.addChild(createNode(
                offsetX + (x * spacing),
                offsetY + (y * spacing),
            ));
        }
    }

    return root;
};

const runScenario = (scenario: BenchmarkScenario): BenchmarkResult => {
    const runtime = createRuntime();
    let frameTimeSum = 0;
    let drawnSum = 0;
    let culledSum = 0;

    for (let frame = 0; frame < frameCount; frame++) {
        runtime.resetStats();
        scenario.beforeFrame(frame, runtime);

        const start = performance.now();

        scenario.root.render(runtime);
        runtime.flush();

        frameTimeSum += performance.now() - start;
        drawnSum += runtime.stats.submittedNodes;
        culledSum += runtime.stats.culledNodes;
    }

    const result = {
        scenario: scenario.name,
        frames: frameCount,
        nodeCount: scenario.root.children.length,
        avgFrameMs: Number((frameTimeSum / frameCount).toFixed(3)),
        avgDrawn: Number((drawnSum / frameCount).toFixed(1)),
        avgCulled: Number((culledSum / frameCount).toFixed(1)),
    };

    scenario.root.destroy();
    runtime.destroy();

    return result;
};

const run = (): void => {
    const scenarios: Array<BenchmarkScenario> = [
        {
            name: 'dense-visible',
            root: createGridScene(200, 40, 20),
            beforeFrame: () => {
                // Default camera; many nodes visible.
            },
        },
        {
            name: 'dense-mostly-offscreen',
            root: createGridScene(200, 40, 20, 5000, 5000),
            beforeFrame: () => {
                // All nodes remain outside the visible view.
            },
        },
        {
            name: 'camera-pan',
            root: createGridScene(300, 20, 18),
            beforeFrame: (frame, runtime) => {
                runtime.view.setCenter(400 + (frame * 18), 300);
            },
        },
    ];

    const results = scenarios.map(runScenario);

    console.log('ExoJS Phase 3 benchmark (CPU-side traversal/culling)');
    console.table(results);
};

run();
