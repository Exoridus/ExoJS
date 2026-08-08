/**
 * Interaction benchmark — hit-test and pointer-event overhead.
 *
 * Drives the real InputManager → InteractionManager pipeline through
 * {@link createInteractionHarness} (a fake, DOM-free PlatformAdapter + a real
 * InputManager/InteractionManager pair) so every scenario measures actual
 * engine code, not a hand-copied stand-in:
 *
 *   1. World hit-testing — nodes live directly under the scene root, which
 *      auto-maintains InteractionManager's internal spatial index (a
 *      DynamicAabbTree), exercising `_hitTestIndexed`.
 *   2. Scoped hit-testing — the same node count confined under an
 *      `interaction.pushScope(...)` root, which bypasses the spatial index
 *      and exercises the recursive `_hitTestNode` walk instead.
 *   3. Drag-move — a real `draggable` node dragged through the real
 *      gesture-recognizer + drag state machine (press, then repeated
 *      pointermoves past `dragThreshold`), not a hand-simulated position
 *      write.
 *
 * Each scenario times a block of synthetic pointer events fed through
 * `platform.onSurfaceEvent(...)` and flushed via `input.preUpdate()` +
 * `interaction.preUpdate()` — the exact per-frame call `Application` makes —
 * so the measured cost is the real dispatch + hit-test path, never a private
 * method called directly.
 *
 * Output: test/perf/results/interaction.{json,md}
 */

import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import type { BenchmarkResult } from './harness';
import { runScenario, writeResults } from './harness';
import type { InteractionHarness } from './interaction-harness';
import { createInteractionHarness } from './interaction-harness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeInteractiveDrawable = (x: number, y: number, size = 32): Drawable => {
  const d = new Drawable();
  d._setLocalBounds(0, 0, size, size);
  d.setPosition(x, y);
  d.interactive = true;
  return d;
};

/** Establish pointer id 1 (a `pointerover`) before any move/down/up — InputManager ignores events for an unknown pointer id. */
const primePointer = (harness: InteractionHarness, x: number, y: number): void => {
  harness.firePointer('pointerover', { clientX: x, clientY: y });
  harness.flush();
};

// ---------------------------------------------------------------------------
// Results accumulator
// ---------------------------------------------------------------------------

const results: BenchmarkResult[] = [];

// ---------------------------------------------------------------------------
// Scenario 1 — World (indexed) hit-test: 1 000 nodes under the scene root,
// 100 pointer queries per iteration. InteractionManager auto-builds and
// maintains its DynamicAabbTree as soon as the first node turns interactive,
// so this exercises `_hitTestIndexed` for real.
// ---------------------------------------------------------------------------

{
  let harness: InteractionHarness | null = null;
  const NODES = 1000;
  const QUERIES_PER_FRAME = 100;

  results.push(
    runScenario({
      name: 'hit-test-indexed-1k',
      setup() {
        harness = createInteractionHarness();

        for (let i = 0; i < NODES; i++) {
          harness.scene.root.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
        }

        primePointer(harness, 0, 0);
      },
      tick(frame) {
        for (let q = 0; q < QUERIES_PER_FRAME; q++) {
          const x = (frame * 97 + q * 31) % 1000;
          const y = (frame * 53 + q * 17) % 625;

          harness!.firePointer('pointermove', { clientX: x, clientY: y });
          harness!.flush();
        }
      },
      teardown() {
        harness!.destroy();
        harness = null;
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Scenario 2 — Scoped (recursive) hit-test: same node count and query
// pattern, but confined under `interaction.pushScope(...)`, which bypasses
// the spatial index and walks the tree via `_hitTestNode` instead — the same
// path a modal/dialog subtree takes.
// ---------------------------------------------------------------------------

{
  let harness: InteractionHarness | null = null;
  const NODES = 1000;
  const QUERIES_PER_FRAME = 100;

  results.push(
    runScenario({
      name: 'hit-test-scoped-1k',
      setup() {
        harness = createInteractionHarness();

        const scopeRoot = new Container();

        for (let i = 0; i < NODES; i++) {
          scopeRoot.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
        }

        harness.scene.root.addChild(scopeRoot);
        harness.pushScope(scopeRoot);
        primePointer(harness, 0, 0);
      },
      tick(frame) {
        for (let q = 0; q < QUERIES_PER_FRAME; q++) {
          const x = (frame * 97 + q * 31) % 1000;
          const y = (frame * 53 + q * 17) % 625;

          harness!.firePointer('pointermove', { clientX: x, clientY: y });
          harness!.flush();
        }
      },
      teardown() {
        harness!.destroy();
        harness = null;
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 — Drag-move: one draggable node, a real press + 50
// pointermoves-past-threshold per iteration, driven through the actual
// gesture-recognizer + drag state machine (InteractionManager._advanceDragOnMove),
// not a hand-simulated `position.x = …` write.
// ---------------------------------------------------------------------------

{
  let harness: InteractionHarness | null = null;
  let dragNode: Drawable | null = null;
  const MOVES_PER_FRAME = 50;
  const OFFSET_X = 5;
  const OFFSET_Y = 5;

  results.push(
    runScenario({
      name: 'drag-move-50-events',
      setup() {
        // Low threshold: every synthetic move below is well past it, so each
        // one keeps the real drag active instead of only the first.
        harness = createInteractionHarness({ dragThreshold: 2 });
        dragNode = makeInteractiveDrawable(400, 300, 64);
        dragNode.draggable = true;
        harness.scene.root.addChild(dragNode);

        primePointer(harness, 400, 300);
        harness.firePointer('pointerdown', { clientX: 400, clientY: 300, buttons: 1 });
        harness.flush();
      },
      tick(frame) {
        for (let m = 0; m < MOVES_PER_FRAME; m++) {
          const px = 200 + Math.sin((frame * MOVES_PER_FRAME + m) * 0.01) * 150;
          const py = 150 + Math.cos((frame * MOVES_PER_FRAME + m) * 0.01) * 100;

          harness!.firePointer('pointermove', { clientX: px + OFFSET_X, clientY: py + OFFSET_Y, buttons: 1 });
          harness!.flush();
        }
      },
      teardown() {
        harness!.destroy();
        harness = null;
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
