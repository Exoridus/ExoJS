/**
 * Scene-graph benchmark — Container / SceneNode operation cost.
 *
 * Measures the CPU cost of transform invalidation cascades, bounds cache
 * reads, addChild/removeChild churn, and z-index sort.
 *
 * Output: test/perf/results/scene-graph.{json,md}
 */

import { runScenario, writeResults } from './harness';
import type { BenchmarkResult } from './harness';

import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDrawable = (x = 0, y = 0, size = 16): Drawable => {
    const d = new Drawable();
    d.getLocalBounds().set(0, 0, size, size);
    d.setPosition(x, y);
    return d;
};

// ---------------------------------------------------------------------------
// Results accumulator
// ---------------------------------------------------------------------------

const results: Array<BenchmarkResult> = [];

// ---------------------------------------------------------------------------
// Scenario 1 — Deep tree transform invalidation
// Levels: 1+10+100+1000+10000 = 11111 nodes
// Each iteration sets position on the root — triggers _invalidateSubtreeTransform
// propagation down all 11111 nodes.
// ---------------------------------------------------------------------------

{
    let root: Container | null = null;

    results.push(runScenario({
        name: 'deep-tree-invalidation-11k',
        setup() {
            root = new Container();

            // Level 1 → 10 children of root
            for (let a = 0; a < 10; a++) {
                const lvl1 = new Container();
                root.addChild(lvl1);

                // Level 2 → 10 children each (100 total)
                for (let b = 0; b < 10; b++) {
                    const lvl2 = new Container();
                    lvl1.addChild(lvl2);

                    // Level 3 → 10 children each (1000 total)
                    for (let c = 0; c < 10; c++) {
                        const lvl3 = new Container();
                        lvl2.addChild(lvl3);

                        // Level 4 → 10 leaf drawables each (10000 total)
                        for (let d = 0; d < 10; d++) {
                            lvl3.addChild(makeDrawable(d * 20, c * 20));
                        }
                    }
                }
            }
        },
        tick(i) {
            // Setting position triggers _setPositionDirty → _invalidateSubtreeTransform on root
            root!.setPosition(i % 100, i % 100);
        },
        teardown() {
            root!.destroy();
            root = null;
        },
    }));
}

// ---------------------------------------------------------------------------
// Scenario 2 — Bounds cache reads (1 000 nodes, 100 getBounds() calls/frame)
// ---------------------------------------------------------------------------

{
    let root: Container | null = null;
    const nodes: Array<Drawable> = [];

    results.push(runScenario({
        name: 'bounds-cache-1k-nodes',
        setup() {
            root = new Container();
            for (let i = 0; i < 1000; i++) {
                const d = makeDrawable((i % 50) * 20, Math.floor(i / 50) * 20);
                root.addChild(d);
                nodes.push(d);
            }
        },
        tick(i) {
            // Invalidate once every 10 frames to mix cache-hit and recompute paths
            if (i % 10 === 0) {
                root!.setPosition(i % 50, 0);
            }
            // Read bounds on 100 random-ish nodes
            for (let j = 0; j < 100; j++) {
                nodes[(i * 97 + j * 31) % nodes.length].getBounds();
            }
        },
        teardown() {
            root!.destroy();
            root = null;
            nodes.length = 0;
        },
    }));
}

// ---------------------------------------------------------------------------
// Scenario 3 — addChild/removeChild churn (1 000 nodes, 50 swaps/frame)
// ---------------------------------------------------------------------------

{
    let parentA: Container | null = null;
    let parentB: Container | null = null;
    const pool: Array<Drawable> = [];

    results.push(runScenario({
        name: 'addchild-removechild-churn',
        setup() {
            parentA = new Container();
            parentB = new Container();

            for (let i = 0; i < 1000; i++) {
                const d = makeDrawable(i * 5, 0);
                pool.push(d);
                parentA.addChild(d);
            }
        },
        tick(frame) {
            // Move 50 nodes from A→B or B→A each frame, alternating
            const src  = frame % 2 === 0 ? parentA! : parentB!;
            const dest = frame % 2 === 0 ? parentB! : parentA!;
            const srcChildren = src.children;

            const count = Math.min(50, srcChildren.length);
            const toMove: Array<Drawable> = [];

            for (let i = 0; i < count; i++) {
                toMove.push(srcChildren[i] as Drawable);
            }

            for (const child of toMove) {
                dest.addChild(child);
            }
        },
        teardown() {
            // All nodes are inside one of the parents
            parentA!.destroy();
            parentB!.destroy();
            parentA = null;
            parentB = null;
            pool.length = 0;
        },
    }));
}

// ---------------------------------------------------------------------------
// Scenario 4 — Sort-by-zIndex (1 000 children, random z, sorted every frame)
// ---------------------------------------------------------------------------

{
    let root: Container | null = null;

    results.push(runScenario({
        name: 'sort-by-zindex-1k',
        setup() {
            root = new Container();
            root.sortableChildren = true;

            for (let i = 0; i < 1000; i++) {
                const d = makeDrawable(i * 2, 0);
                d.zIndex = Math.floor(Math.random() * 1000);
                root.addChild(d);
            }
        },
        tick() {
            // Shuffle zIndex values to force a re-sort each frame
            for (const child of root!.children) {
                child.zIndex = Math.floor(Math.random() * 1000);
            }
            // markSortDirty is called internally by the zIndex setter;
            // trigger the sort by accessing children (render would do this).
            // We access the internal sort via a render-less path: calling
            // markSortDirty + reading children triggers the sort on the next render.
            // We simulate this by calling the Container's own sort path:
            (root as unknown as { _sortChildrenIfNeeded(): void })._sortChildrenIfNeeded?.();
        },
        teardown() {
            root!.destroy();
            root = null;
        },
    }));
}

// ---------------------------------------------------------------------------
// Write results
// ---------------------------------------------------------------------------

console.log('ExoJS scene-graph benchmark');
console.table(results);
writeResults('scene-graph', 'Scene-Graph Benchmark', results);
