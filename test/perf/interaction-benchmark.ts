/**
 * Interaction benchmark — hit-test and pointer-event overhead.
 *
 * Benchmarks the two hit-testing strategies used by InteractionManager:
 *   1. Recursive tree walk (no spatial index)
 *   2. Quadtree-accelerated hit-test
 *
 * Also measures the cost of the drag-move path (position update + signal).
 *
 * We inline the hit-test algorithms rather than instantiating a full
 * Application (which requires canvas, InputManager, etc.), so that the
 * benchmark stays self-contained and runs in plain Node.js.
 *
 * Output: test/perf/results/interaction.{json,md}
 */

import type { QuadtreeItem } from '../../src/math/Quadtree';
import { Quadtree } from '../../src/math/Quadtree';
import { Rectangle } from '../../src/math/Rectangle';
import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import type { RenderNode } from '../../src/rendering/RenderNode';
import type { BenchmarkResult } from './harness';
import { runScenario, writeResults } from './harness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeInteractiveDrawable = (x: number, y: number, size = 32): Drawable => {
  const d = new Drawable();
  d.getLocalBounds().set(0, 0, size, size);
  d.setPosition(x, y);
  d.interactive = true;
  return d;
};

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

  if (node.interactive && node.contains(x, y)) {
    return node;
  }

  return null;
};

// Inlined indexed hit-test (mirrors InteractionManager._hitTestIndexed)
interface IndexedNode {
  node: RenderNode;
  order: number;
}

const hitTestIndexed = (qt: Quadtree<IndexedNode>, buf: Array<QuadtreeItem<IndexedNode>>, x: number, y: number): RenderNode | null => {
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

// Build a quadtree index from a root container
const buildIndex = (root: Container, worldBounds: Rectangle): Quadtree<IndexedNode> => {
  const qt = new Quadtree<IndexedNode>(new Rectangle(worldBounds.x, worldBounds.y, worldBounds.width, worldBounds.height));
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
// Results accumulator
// ---------------------------------------------------------------------------

const results: BenchmarkResult[] = [];

// ---------------------------------------------------------------------------
// Scenario 1 — Recursive hit-test (1 000 nodes, 100 queries/frame)
// ---------------------------------------------------------------------------

{
  let root: Container | null = null;
  const NODES = 1000;
  const QUERIES_PER_FRAME = 100;

  results.push(
    runScenario({
      name: 'hit-test-recursive-1k',
      setup() {
        root = new Container();
        for (let i = 0; i < NODES; i++) {
          root.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
        }
      },
      tick(frame) {
        for (let q = 0; q < QUERIES_PER_FRAME; q++) {
          const x = (frame * 97 + q * 31) % 1000;
          const y = (frame * 53 + q * 17) % 625;
          hitTestRecursive(root!, x, y);
        }
      },
      teardown() {
        root!.destroy();
        root = null;
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Scenario 2 — Spatial-index hit-test (same setup, quadtree rebuilt each frame)
// ---------------------------------------------------------------------------

{
  let root: Container | null = null;
  const NODES = 1000;
  const QUERIES_PER_FRAME = 100;
  const buf: Array<QuadtreeItem<IndexedNode>> = [];
  const worldBounds = new Rectangle(0, 0, 1000, 625);

  results.push(
    runScenario({
      name: 'hit-test-quadtree-1k',
      setup() {
        root = new Container();
        for (let i = 0; i < NODES; i++) {
          root.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
        }
      },
      tick(frame) {
        // Rebuild index each frame (mirrors InteractionManager._buildIndex)
        const qt = buildIndex(root!, worldBounds);

        for (let q = 0; q < QUERIES_PER_FRAME; q++) {
          const x = (frame * 97 + q * 31) % 1000;
          const y = (frame * 53 + q * 17) % 625;
          hitTestIndexed(qt, buf, x, y);
        }

        qt.destroy();
      },
      teardown() {
        root!.destroy();
        root = null;
        worldBounds.destroy();
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 — Drag-move: position update + 50 pointermove events per frame
//
// Simulates the InteractionManager._processQueue move path:
//   drag.node.position.x = x + offsetX
//   drag.node.position.y = y + offsetY
// No actual signal dispatch — measures the position-setter + invalidation cost.
// ---------------------------------------------------------------------------

{
  let dragNode: Drawable | null = null;
  let root: Container | null = null;
  const MOVES_PER_FRAME = 50;
  const OFFSET_X = 5;
  const OFFSET_Y = 5;

  results.push(
    runScenario({
      name: 'drag-move-50-events',
      setup() {
        root = new Container();
        dragNode = makeInteractiveDrawable(400, 300, 64);
        dragNode.draggable = true;
        root.addChild(dragNode);
      },
      tick(frame) {
        // Simulate 50 pointermove updates (the hot path in drag handling)
        for (let m = 0; m < MOVES_PER_FRAME; m++) {
          const px = 200 + Math.sin((frame * MOVES_PER_FRAME + m) * 0.01) * 150;
          const py = 150 + Math.cos((frame * MOVES_PER_FRAME + m) * 0.01) * 100;
          dragNode!.position.x = px + OFFSET_X;
          dragNode!.position.y = py + OFFSET_Y;
        }
      },
      teardown() {
        root!.destroy();
        root = null;
        dragNode = null;
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Write results
// ---------------------------------------------------------------------------

console.log('ExoJS interaction benchmark (hit-test / drag overhead)');
console.table(results);
writeResults('interaction', 'Interaction Benchmark', results);
