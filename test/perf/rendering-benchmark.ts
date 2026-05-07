/**
 * Rendering benchmark — CPU-side traversal / culling cost.
 *
 * Measures wall-clock time for Container.render() across scenes of varying
 * density and camera coverage.  No GPU work is performed: the stub backend
 * records draw calls but never actually submits them to a GPU.
 *
 * Output: test/perf/results/rendering.{json,md}
 */

import { performance } from 'node:perf_hooks';

import { RenderBackendType } from '../../src/rendering/RenderBackendType';
import { RenderTarget } from '../../src/rendering/RenderTarget';
import { createRenderStats, resetRenderStats } from '../../src/rendering/RenderStats';
import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import { RenderTexture } from '../../src/rendering/texture/RenderTexture';
import type { RenderBackend } from '../../src/rendering/RenderBackend';
import { writeResults, formatResults } from './harness';
import type { BenchmarkResult, ColumnDef } from './harness';

// ---------------------------------------------------------------------------
// Rendering-specific types
// ---------------------------------------------------------------------------

interface RenderingScenario {
    readonly name: string;
    readonly root: Container;
    beforeFrame(frame: number, runtime: RenderBackend): void;
}

interface RenderingResult extends BenchmarkResult {
    readonly nodeCount: number;
    readonly avgDrawn: number;
    readonly avgCulled: number;
}

// ---------------------------------------------------------------------------
// Stub runtime
// ---------------------------------------------------------------------------

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;
const FRAME_COUNT = 240;

const createStubRuntime = (): RenderBackend => {
    const renderTarget = new RenderTarget(VIEWPORT_W, VIEWPORT_H, true);
    const stats = createRenderStats();

    return {
        backendType: RenderBackendType.WebGl2,
        stats,
        renderTarget,
        get view() { return renderTarget.view; },
        async initialize() { return this; },
        resetStats() { resetRenderStats(stats); return this; },
        clear() { return this; },
        resize(w, h) { renderTarget.resize(w, h); return this; },
        setView(v) { renderTarget.setView(v); return this; },
        setRenderTarget() { return this; },
        pushScissorRect() { return this; },
        popScissorRect() { return this; },
        composeWithAlphaMask() { return this; },
        acquireRenderTexture(w, h) { return new RenderTexture(w, h); },
        releaseRenderTexture(t) { t.destroy(); return this; },
        draw() { stats.submittedNodes++; return this; },
        execute() { return this; },
        flush() { return this; },
        destroy() { renderTarget.destroy(); },
    };
};

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

const createNode = (x: number, y: number, size = 16): Drawable => {
    const node = new Drawable();
    node.getLocalBounds().set(0, 0, size, size);
    node.setPosition(x, y);
    return node;
};

const createGridScene = (cols: number, rows: number, spacing: number, ox = 0, oy = 0): Container => {
    const root = new Container();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            root.addChild(createNode(ox + c * spacing, oy + r * spacing));
        }
    }
    return root;
};

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

const runScenario = (scenario: RenderingScenario): RenderingResult => {
    const runtime = createStubRuntime();
    let frameTimeSum = 0;
    let drawnSum = 0;
    let culledSum = 0;

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
        runtime.resetStats();
        scenario.beforeFrame(frame, runtime);

        const t0 = performance.now();
        scenario.root.render(runtime);
        runtime.flush();
        frameTimeSum += performance.now() - t0;

        drawnSum  += runtime.stats.submittedNodes;
        culledSum += runtime.stats.culledNodes;
    }

    const result: RenderingResult = {
        scenario:    scenario.name,
        iterations:  FRAME_COUNT,
        avgMs:       Number((frameTimeSum / FRAME_COUNT).toFixed(4)),
        minMs:       0, // rendering tracks frame sum only
        maxMs:       0,
        nodeCount:   scenario.root.children.length,
        avgDrawn:    Number((drawnSum  / FRAME_COUNT).toFixed(1)),
        avgCulled:   Number((culledSum / FRAME_COUNT).toFixed(1)),
    };

    scenario.root.destroy();
    runtime.destroy();

    return result;
};

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarios: Array<RenderingScenario> = [
    {
        name: 'dense-visible',
        root: createGridScene(200, 40, 20),
        beforeFrame: () => { /* camera at origin — most nodes visible */ },
    },
    {
        name: 'dense-mostly-offscreen',
        root: createGridScene(200, 40, 20, 5000, 5000),
        beforeFrame: () => { /* all nodes placed far off-screen */ },
    },
    {
        name: 'camera-pan',
        root: createGridScene(300, 20, 18),
        beforeFrame: (frame, runtime) => { runtime.view.setCenter(400 + frame * 18, 300); },
    },
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const EXTRA_COLUMNS: Array<ColumnDef> = [
    { key: 'scenario',  header: 'Scenario',   align: 'left'  },
    { key: 'iterations', header: 'Frames',    align: 'right' },
    { key: 'nodeCount', header: 'Nodes',      align: 'right' },
    { key: 'avgMs',     header: 'Avg Frame ms', align: 'right' },
    { key: 'avgDrawn',  header: 'Avg Drawn',  align: 'right' },
    { key: 'avgCulled', header: 'Avg Culled', align: 'right' },
];

const run = (): void => {
    console.log('ExoJS rendering benchmark (CPU-side traversal/culling)');
    const results = scenarios.map(runScenario);
    console.table(results);
    console.log('\nMarkdown table:\n');
    console.log(formatResults(results, EXTRA_COLUMNS));
    writeResults('rendering', 'Rendering Benchmark', results, EXTRA_COLUMNS);
};

run();
