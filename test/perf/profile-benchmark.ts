/**
 * ExoJS Phase 2 Auto-Profiler — granular sub-timings, memory deltas, call counts.
 *
 * Picks the five hottest scenarios from Phase 1 baseline.md and re-runs them
 * with SubTimingTracker, MemoryTracker, and CallCounter instrumentation, then
 * writes test/perf/results/findings.md with Top-3-Wins recommendations.
 *
 * Run via:
 *   npm run perf:profile          (no GC forcing)
 *   npm run perf:profile:gc       (--expose-gc for accurate memory deltas)
 */

import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { SubTimingTracker, MemoryTracker, CallCounter } from './profile-runner';
import type { ProfileScenarioResult } from './profile-runner';

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------

const resultsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'results');

// ---------------------------------------------------------------------------
// Audio mock — must be set up before any ExoJS audio import
// ---------------------------------------------------------------------------

const makeParam = (): AudioParam => ({
    value: 0,
    setValueAtTime:               () => undefined as unknown as AudioParam,
    setTargetAtTime:              () => undefined as unknown as AudioParam,
    cancelScheduledValues:        () => undefined as unknown as AudioParam,
    linearRampToValueAtTime:      () => undefined as unknown as AudioParam,
    exponentialRampToValueAtTime: () => undefined as unknown as AudioParam,
    setValueCurveAtTime:          () => undefined as unknown as AudioParam,
    cancelAndHoldAtTime:          () => undefined as unknown as AudioParam,
    automationRate: 'a-rate' as AutomationRate,
    defaultValue: 0,
    minValue: -Infinity,
    maxValue: Infinity,
} as unknown as AudioParam);

const makeGain = (): GainNode => ({
    connect: () => undefined, disconnect: () => undefined,
    context: null as unknown as AudioContext,
    gain: {
        value: 1,
        setTargetAtTime:         () => undefined,
        cancelScheduledValues:   () => undefined,
        setValueAtTime:          () => undefined,
        linearRampToValueAtTime: () => undefined,
    },
} as unknown as GainNode);

const makePanner = (): PannerNode => ({
    connect: () => undefined, disconnect: () => undefined,
    context:       { currentTime: 0 } as AudioContext,
    panningModel:  'equalpower' as PanningModelType,
    distanceModel: 'linear' as DistanceModelType,
    maxDistance: 10000, refDistance: 1, rolloffFactor: 1,
    positionX: makeParam(), positionY: makeParam(), positionZ: makeParam(),
} as unknown as PannerNode);

const makeStereoPanner = (): StereoPannerNode => ({
    connect: () => undefined, disconnect: () => undefined,
    pan: { value: 0, setTargetAtTime: () => undefined },
} as unknown as StereoPannerNode);

const makeBiquadFilter = (): BiquadFilterNode => ({
    connect: () => undefined, disconnect: () => undefined,
    context: { currentTime: 0 } as AudioContext,
    type: 'lowpass' as BiquadFilterType,
    frequency: { value: 350, setValueAtTime: () => undefined, setTargetAtTime: () => undefined },
    Q:         { value: 1,   setValueAtTime: () => undefined, setTargetAtTime: () => undefined },
    gain:      { value: 0,   setValueAtTime: () => undefined, setTargetAtTime: () => undefined },
} as unknown as BiquadFilterNode);

let _srcId = 0;
const makeBufferSource = (): AudioBufferSourceNode => ({
    _id: ++_srcId,
    connect: () => undefined, disconnect: () => undefined,
    start: () => undefined, stop: () => undefined,
    playbackRate: { value: 1 }, loop: false, loopStart: 0, loopEnd: 0,
    buffer: null, onended: null,
} as unknown as AudioBufferSourceNode);

const MOCK_LISTENER = {
    positionX: makeParam(), positionY: makeParam(), positionZ: makeParam(),
    forwardX:  makeParam(), forwardY:  makeParam(), forwardZ:  makeParam(),
    upX:       makeParam(), upY:       makeParam(), upZ:       makeParam(),
} as unknown as globalThis.AudioListener;

const makeMockContext = (): AudioContext => ({
    state: 'running' as AudioContextState,
    currentTime: 0, sampleRate: 44100,
    destination: {} as AudioDestinationNode,
    listener: MOCK_LISTENER,
    createGain:         () => makeGain(),
    createBufferSource: () => makeBufferSource(),
    createStereoPanner: () => makeStereoPanner(),
    createPanner:       () => makePanner(),
    createBiquadFilter: () => makeBiquadFilter(),
    createBuffer: (ch: number, len: number, sr: number): AudioBuffer => ({
        numberOfChannels: ch, length: len, sampleRate: sr,
        duration: len / sr,
        getChannelData: () => new Float32Array(len),
    } as AudioBuffer),
} as unknown as AudioContext);

Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true, writable: true,
    value: class { constructor() { return makeMockContext(); } },
});

if (typeof (globalThis as Record<string, unknown>)['OfflineAudioContext'] === 'undefined') {
    Object.defineProperty(globalThis, 'OfflineAudioContext', {
        configurable: true, writable: true,
        value: class {
            public sampleRate: number;
            constructor(_c: number, _l: number, sr: number) { this.sampleRate = sr; }
            decodeAudioData() { return Promise.resolve({} as AudioBuffer); }
        },
    });
}

if (typeof (globalThis as Record<string, unknown>)['AudioWorkletNode'] === 'undefined') {
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
        configurable: true, writable: true,
        value: class {
            connect = () => undefined;
            disconnect = () => undefined;
            parameters = new Map<string, AudioParam>();
            port = { postMessage: () => undefined, onmessage: null };
        },
    });
}

// ---------------------------------------------------------------------------
// Domain imports (after audio mock)
// ---------------------------------------------------------------------------

import { Polygon } from '../../src/math/Polygon';
import { Vector } from '../../src/math/Vector';
import { Rectangle } from '../../src/math/Rectangle';
import { Quadtree } from '../../src/math/Quadtree';
import { getCollisionSat } from '../../src/math/collision-detection';
import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import { Sound } from '../../src/audio/Sound';
import type { RenderNode } from '../../src/rendering/RenderNode';
import type { QuadtreeItem } from '../../src/math/Quadtree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rng = (seed: number) => {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
};

const makeRegularPolygon = (cx: number, cy: number, radius: number, sides: number): Polygon => {
    const points: Array<Vector> = [];
    for (let i = 0; i < sides; i++) {
        const angle = (2 * Math.PI * i) / sides;
        points.push(new Vector(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
    return new Polygon(points, cx, cy);
};

const makeInteractiveDrawable = (x: number, y: number, size = 32): Drawable => {
    const d = new Drawable();
    d.getLocalBounds().set(0, 0, size, size);
    d.setPosition(x, y);
    d.interactive = true;
    return d;
};

const makeAudioBuffer = (duration = 2, sampleRate = 44100): AudioBuffer => ({
    duration, sampleRate,
    numberOfChannels: 1,
    length: duration * sampleRate,
    getChannelData: () => new Float32Array(duration * sampleRate),
} as unknown as AudioBuffer);

// Inlined recursive hit-test (mirrors InteractionManager._hitTestNode)
const hitTestRecursive = (node: RenderNode, x: number, y: number): RenderNode | null => {
    if (!node.visible) return null;
    if (node instanceof Container) {
        const children = node.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const hit = hitTestRecursive(children[i], x, y);
            if (hit) return hit;
        }
    }
    if (node.interactive && node.contains(x, y)) return node;
    return null;
};

// Inlined quadtree hit-test
interface IndexedNode { node: RenderNode; order: number; }

const hitTestIndexed = (
    qt: Quadtree<IndexedNode>,
    buf: Array<QuadtreeItem<IndexedNode>>,
    x: number,
    y: number,
): RenderNode | null => {
    buf.length = 0;
    qt.queryPoint(x, y, buf);
    let bestOrder = -1;
    let bestNode: RenderNode | null = null;
    for (const candidate of buf) {
        const { node, order } = candidate.payload;
        if (order > bestOrder && node.contains(x, y)) {
            bestOrder = order;
            bestNode = node;
        }
    }
    return bestNode;
};

const buildIndex = (root: Container, worldBounds: Rectangle): Quadtree<IndexedNode> => {
    const qt = new Quadtree<IndexedNode>(new Rectangle(
        worldBounds.x, worldBounds.y, worldBounds.width, worldBounds.height,
    ));
    let order = 0;
    const collect = (node: RenderNode): void => {
        if (!node.visible) return;
        if (node.interactive) {
            qt.insert({ bounds: node.getBounds(), payload: { node, order: order++ } });
        }
        if (node instanceof Container) {
            for (const child of node.children) collect(child);
        }
    };
    collect(root);
    return qt;
};

// ---------------------------------------------------------------------------
// Profile-runner wrapper
// ---------------------------------------------------------------------------

interface ProfileTask {
    name: string;
    iterations: number;
    setup?(): void;
    tick(i: number, timings: SubTimingTracker, counter: CallCounter): void;
    teardown?(): void;
}

const runProfile = (task: ProfileTask): ProfileScenarioResult => {
    const mem = new MemoryTracker();
    task.setup?.();

    const timings = new SubTimingTracker();
    const counter = new CallCounter();

    mem.baseline();
    const t0 = performance.now();

    for (let i = 0; i < task.iterations; i++) {
        task.tick(i, timings, counter);
    }

    const totalMs = performance.now() - t0;
    const memory = mem.delta();

    task.teardown?.();

    return {
        name: task.name,
        totalMs,
        iterations: task.iterations,
        subTimings: timings.summarize(),
        callCounts: counter.summarize(),
        memory,
    };
};

// ---------------------------------------------------------------------------
// Profiled scenarios
// ---------------------------------------------------------------------------

const scenarioResults: Array<ProfileScenarioResult> = [];

// ── 1. SAT polygon-pairs-1k ────────────────────────────────────────────────

{
    const rand = rng(42);
    const PAIRS = 1000;
    const polygons: Array<[Polygon, Polygon]> = [];

    scenarioResults.push(runProfile({
        name: 'sat-polygon-pairs-1k',
        iterations: 1000,
        setup() {
            for (let i = 0; i < PAIRS; i++) {
                const ax = rand() * 2000;
                const ay = rand() * 2000;
                const bx = ax + (rand() - 0.5) * 100;
                const by = ay + (rand() - 0.5) * 100;
                polygons.push([
                    makeRegularPolygon(ax, ay, 20 + rand() * 30, 3 + Math.floor(rand() * 6)),
                    makeRegularPolygon(bx, by, 20 + rand() * 30, 3 + Math.floor(rand() * 6)),
                ]);
            }
        },
        tick(_i, timings, counter) {
            counter.count('polygon-pair-iterations');
            for (const [a, b] of polygons) {
                // Time the getNormals calls separately from the intersection test
                const stopNA = timings.start('getNormals.A');
                const normalsA = a.getNormals();
                stopNA();

                const stopNB = timings.start('getNormals.B');
                const normalsB = b.getNormals();
                stopNB();

                // Project + intersection test
                const stopTest = timings.start('intersection-test');
                getCollisionSat(a, b);
                stopTest();

                // Suppress unused-var warnings — normals are obtained above for timing
                void normalsA;
                void normalsB;
            }
        },
        teardown() {
            for (const [a, b] of polygons) { a.destroy(); b.destroy(); }
            polygons.length = 0;
        },
    }));
}

// ── 2. Quadtree query-10k ─────────────────────────────────────────────────

{
    const rand = rng(13);
    const ITEMS = 1000;
    const QUERIES = 10000;
    let qt: Quadtree<number> | null = null;
    const queryPoints: Array<[number, number]> = [];

    scenarioResults.push(runProfile({
        name: 'quadtree-query-10k',
        iterations: 100,
        setup() {
            qt = new Quadtree<number>(new Rectangle(0, 0, 5000, 5000));
            for (let i = 0; i < ITEMS; i++) {
                qt.insert({
                    bounds: new Rectangle(rand() * 4900, rand() * 4900, 20 + rand() * 60, 20 + rand() * 60),
                    payload: i,
                });
            }
            for (let i = 0; i < QUERIES; i++) {
                queryPoints.push([rand() * 5000, rand() * 5000]);
            }
        },
        tick(_i, timings, counter) {
            counter.count('query-batch-iterations');
            const stopWalk = timings.start('tree-walk-all-queries');
            for (const [x, y] of queryPoints) {
                counter.count('leaf-tests');
                qt!.queryPoint(x, y);
            }
            stopWalk();
        },
        teardown() {
            qt!.destroy();
            qt = null;
            queryPoints.length = 0;
        },
    }));
}

// ── 3. Hit-test recursive ─────────────────────────────────────────────────

{
    let root: Container | null = null;
    const NODES = 1000;
    const QUERIES_PER_FRAME = 100;

    scenarioResults.push(runProfile({
        name: 'hit-test-recursive-1k',
        iterations: 240,
        setup() {
            root = new Container();
            for (let i = 0; i < NODES; i++) {
                root.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
            }
        },
        tick(frame, timings, counter) {
            counter.count('frame-ticks');
            for (let q = 0; q < QUERIES_PER_FRAME; q++) {
                const x = (frame * 97 + q * 31) % 1000;
                const y = (frame * 53 + q * 17) % 625;
                counter.count('recursive-queries');
                const stopWalk = timings.start('tree-walk');
                hitTestRecursive(root!, x, y);
                stopWalk();
            }
        },
        teardown() {
            root!.destroy();
            root = null;
        },
    }));
}

// ── 4. Deep-tree invalidation-11k ─────────────────────────────────────────

{
    let root: Container | null = null;

    scenarioResults.push(runProfile({
        name: 'deep-tree-invalidation-11k',
        iterations: 1000,
        setup() {
            root = new Container();
            for (let a = 0; a < 10; a++) {
                const lvl1 = new Container();
                root.addChild(lvl1);
                for (let b = 0; b < 10; b++) {
                    const lvl2 = new Container();
                    lvl1.addChild(lvl2);
                    for (let c = 0; c < 10; c++) {
                        const lvl3 = new Container();
                        lvl2.addChild(lvl3);
                        for (let d = 0; d < 10; d++) {
                            const leaf = new Drawable();
                            leaf.getLocalBounds().set(0, 0, 16, 16);
                            leaf.setPosition(d * 20, c * 20);
                            lvl3.addChild(leaf);
                        }
                    }
                }
            }
        },
        tick(i, timings, counter) {
            counter.count('invalidation-triggers');
            const stopFlag = timings.start('flag-push');
            root!.setPosition(i % 100, i % 100);
            stopFlag();
        },
        teardown() {
            root!.destroy();
            root = null;
        },
    }));
}

// ── 5. Many sounds play ────────────────────────────────────────────────────

{
    const sounds: Array<Sound> = [];

    scenarioResults.push(runProfile({
        name: 'many-sounds-play',
        iterations: 1000,
        setup() {
            for (let i = 0; i < 50; i++) {
                sounds.push(new Sound(makeAudioBuffer(), { poolSize: 4 }));
            }
        },
        tick(_i, timings, counter) {
            counter.count('play-batches');
            for (const s of sounds) {
                counter.count('sound-play-calls');
                const stopPlay = timings.start('sound.play');
                s.play();
                stopPlay();
            }
        },
        teardown() {
            for (const s of sounds) { s.destroy(); }
            sounds.length = 0;
        },
    }));
}

// ---------------------------------------------------------------------------
// Derive Top-3 wins from results
// ---------------------------------------------------------------------------

const gcAvailable = new MemoryTracker().gcAvailable;

interface Win {
    rank: number;
    scenario: string;
    observation: string;
    recommendation: string;
}

const deriveWins = (results: Array<ProfileScenarioResult>): Array<Win> => {
    // Score = avgMs/iter * 1.0  +  |heapDeltaMb| * 2.0  (allocation pressure weighted)
    const scored = results.map((r) => {
        const avgMs = r.totalMs / r.iterations;
        const heapMb = Math.abs(r.memory.heapUsedDeltaMb);
        const score = avgMs * 1.0 + heapMb * 2.0;
        return { r, avgMs, heapMb, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const wins: Array<Win> = [];

    for (let rank = 0; rank < Math.min(3, scored.length); rank++) {
        const { r, avgMs, heapMb } = scored[rank];

        // Find the most expensive sub-timing
        const sortedTimings = [...r.subTimings].sort((a, b) => b.avgMs - a.avgMs);
        const hotPhase = sortedTimings[0];
        const hotPct = hotPhase && r.totalMs > 0
            ? ((hotPhase.totalMs / r.totalMs) * 100).toFixed(0)
            : '?';

        let observation: string;
        let recommendation: string;

        // Pattern-match on scenario name and heuristics
        if (r.name.startsWith('sat-polygon')) {
            const getNormalsTime = r.subTimings
                .filter((t) => t.label.startsWith('getNormals'))
                .reduce((s, t) => s + t.totalMs, 0);
            const getNormalsPct = r.totalMs > 0 ? ((getNormalsTime / r.totalMs) * 100).toFixed(0) : '?';
            observation = `getNormals() (both shapes) consumes ~${getNormalsPct}% of total SAT time. `
                + `Memory delta ${heapMb.toFixed(2)} MB over ${r.iterations} iters `
                + `(${(heapMb / r.iterations * 1024).toFixed(1)} KB/iter) suggests per-call Vector array allocations.`;
            recommendation = 'Cache getNormals() result on Polygon (invalidate on point mutation). '
                + 'The 0.6.19 dirty-flag pattern used for Sprite normals is the reference implementation '
                + `(commit 76d7d4a). Estimated win: ${getNormalsPct}% of ${avgMs.toFixed(3)} ms/iter.`;
        } else if (r.name.startsWith('quadtree-query')) {
            observation = `All ${r.callCounts.find((c) => c.label === 'leaf-tests')?.count ?? 0} leaf-tests `
                + `run in ${r.totalMs.toFixed(1)} ms total (${avgMs.toFixed(3)} ms/iter). `
                + `Memory delta ${heapMb.toFixed(2)} MB — result arrays reallocated each query.`;
            recommendation = 'Pass a pre-allocated result buffer into queryPoint() on hot paths to eliminate '
                + 'per-query array allocation. The interaction-benchmark already does this with a shared `buf` array '
                + '— pattern is proven. Estimated win: reduce GC pressure, lower tail latency.';
        } else if (r.name.startsWith('hit-test-recursive')) {
            const walkAvg = r.subTimings.find((t) => t.label === 'tree-walk')?.avgMs ?? 0;
            observation = `Linear tree-walk averages ${walkAvg.toFixed(4)} ms/query over ${QUERIES_PER_FRAME_REF} queries/frame. `
                + `No spatial pruning — all ${NODES_REF} nodes visited regardless of pointer position. `
                + `Memory delta ${heapMb.toFixed(2)} MB.`;
            recommendation = 'Use the quadtree-accelerated path (hit-test-quadtree-1k is 5× faster per the baseline). '
                + 'InteractionManager should maintain a persistent spatial index rebuilt only on scene-graph changes, '
                + 'not every frame. Amortizes the build cost across all queries in the frame.';
        } else if (r.name.startsWith('deep-tree-invalidation')) {
            observation = `Full 11k-node subtree invalidation triggered on every setPosition() call `
                + `(${r.callCounts.find((c) => c.label === 'invalidation-triggers')?.count ?? 0} triggers). `
                + `Avg ${avgMs.toFixed(4)} ms/trigger. Memory delta ${heapMb.toFixed(2)} MB — minimal allocation.`;
            recommendation = 'Batch / coalesce transform invalidations within a frame — only flush dirty subtrees '
                + 'once at the start of each render pass rather than immediately on mutation. '
                + 'This is a deferred-dirty pattern common in retained-mode scene graphs.';
        } else if (r.name.startsWith('many-sounds-play')) {
            const playAvg = r.subTimings.find((t) => t.label === 'sound.play')?.avgMs ?? 0;
            const playCalls = r.callCounts.find((c) => c.label === 'sound-play-calls')?.count ?? 0;
            observation = `${playCalls} play() calls total; avg ${playAvg.toFixed(5)} ms/call. `
                + `Memory delta ${heapMb.toFixed(2)} MB — buffer-source nodes allocated per play().`;
            recommendation = 'Expand pool size or introduce source-node recycling. '
                + 'AudioBufferSourceNode cannot be restarted, but the wrapper scaffolding (gain, panner connect/disconnect) '
                + 'can be pooled. Reduces GC pressure during dense audio events.';
        } else {
            // Generic fallback
            observation = `Hot phase "${hotPhase?.label ?? 'unknown'}" takes ~${hotPct}% of total time `
                + `(${avgMs.toFixed(4)} ms/iter). Memory delta ${heapMb.toFixed(2)} MB.`;
            recommendation = 'Investigate further — profile the hot phase with more granular sub-timings '
                + 'or run under --cpu-prof for a flame graph.';
        }

        wins.push({ rank: rank + 1, scenario: r.name, observation, recommendation });
    }

    return wins;
};

// Constants referenced in win derivation closures above
const QUERIES_PER_FRAME_REF = 100;
const NODES_REF = 1000;

const wins = deriveWins(scenarioResults);

// ---------------------------------------------------------------------------
// Format and write findings.md
// ---------------------------------------------------------------------------

const fmtNum = (n: number, decimals = 4): string => n.toFixed(decimals);

const fmtTable = (rows: Array<Array<string>>, headers: Array<string>): string => {
    const all = [headers, ...rows];
    const widths = headers.map((_, ci) =>
        Math.max(...all.map((row) => (row[ci] ?? '').length)),
    );

    const pad = (s: string, w: number, right = false): string =>
        right ? s.padStart(w) : s.padEnd(w);

    const line = (row: Array<string>, rights: Array<boolean> = []): string =>
        `| ${row.map((cell, i) => pad(cell, widths[i], rights[i] ?? false)).join(' | ')} |`;

    const sep = `| ${widths.map((w, i) => (i > 0 ? '-'.repeat(w - 1) + ':' : '-'.repeat(w))).join(' | ')} |`;

    return [line(headers), sep, ...rows.map((r) => line(r, [false, true, true]))].join('\n');
};

const formatScenario = (r: ProfileScenarioResult): string => {
    const avgMs = r.totalMs / r.iterations;
    const lines: Array<string> = [];

    lines.push(`### Scenario: ${r.name}`);
    lines.push(`- Total: ${fmtNum(r.totalMs, 2)} ms (${r.iterations} iterations, ${fmtNum(avgMs)} ms/iter)`);
    lines.push(`- Memory delta: ${fmtNum(r.memory.heapUsedDeltaMb, 3)} MB (gc=${r.memory.gcUsed})`);

    if (r.subTimings.length > 0) {
        lines.push('- Sub-timings:');
        const rows = r.subTimings.map((t) => [t.label, fmtNum(t.avgMs, 5), String(t.samples)]);
        lines.push(
            fmtTable(rows, ['Phase', 'Avg ms', 'Samples'])
                .split('\n')
                .map((l) => `  ${l}`)
                .join('\n'),
        );
    }

    if (r.callCounts.length > 0) {
        lines.push('- Call counts:');
        const rows = r.callCounts.map((c) => [c.label, String(c.count)]);
        lines.push(
            fmtTable(rows, ['Operation', 'Count'])
                .split('\n')
                .map((l) => `  ${l}`)
                .join('\n'),
        );
    }

    return lines.join('\n');
};

const now = new Date().toISOString().slice(0, 10);

const md = [
    '# Performance Findings — Phase 2 Auto-Profile',
    '',
    `Captured on ${now}. GC available: ${gcAvailable}.`,
    '',
    '## Summary',
    '',
    'Top-3 wins (auto-derived from highest cost-per-iteration + allocation scenarios):',
    '',
    ...wins.map((w) => [
        `${w.rank}. **${w.scenario}** — ${w.observation}`,
        `   - Recommendation: ${w.recommendation}`,
    ].join('\n')),
    '',
    '---',
    '',
    '## Detailed Profile Per Scenario',
    '',
    scenarioResults.map(formatScenario).join('\n\n'),
].join('\n');

// Suffix output with package version + short git SHA so multiple local
// runs accumulate without overwriting each other (all gitignored).
const buildIdentifier = (() => {
    let version = 'unknown';
    try {
        const pkg = JSON.parse(readFileSync(resolve(resultsDir, '../../../package.json'), 'utf-8')) as { version?: string };
        if (typeof pkg.version === 'string') version = pkg.version;
    } catch { /* ignore */ }
    let sha = '';
    try {
        sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch { /* ignore */ }
    return sha ? `${version}-${sha}` : version;
})();

mkdirSync(resultsDir, { recursive: true });
const outPath = resolve(resultsDir, `findings-${buildIdentifier}.md`);
writeFileSync(outPath, md + '\n', 'utf-8');

console.log('\nExoJS Phase 2 Auto-Profiler complete.');
console.log('Scenarios profiled:', scenarioResults.map((r) => r.name).join(', '));
console.log(`GC available: ${gcAvailable}`);
console.log(`\nTop-3 wins:`);
for (const w of wins) {
    console.log(`  ${w.rank}. ${w.scenario}`);
}
console.log(`\nFindings written to: ${outPath}`);
