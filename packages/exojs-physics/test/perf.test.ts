import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsWorld } from '../src/index';
import type { PhysicsBody } from '../src/PhysicsBody';

/**
 * Phase-2B performance gates (spec `04` §3): P-1 steady-state allocation and P-2
 * 1,000-body step time. The 1,000-body scene is a wide field of 200 independent
 * 5-box columns settled on a static floor — ~1,000 dynamic bodies generating
 * ~1,000 persistent contacts plus the broad-phase load of 1,000 AABBs.
 *
 * P-2 (step time) is **recorded** on the reference machine, not enforced as a
 * tight CI threshold (machine-dependent) — only a generous catastrophic-
 * regression guard is asserted. P-1 (allocation) is measured as the retained
 * heap delta across steps; with `--expose-gc` it is forced-collected for a clean
 * number, otherwise it is an upper bound. Numbers are printed for the record.
 */

const FRAME = 1 / 60;
const forceGc = (globalThis as { gc?: () => void }).gc;

/** A wide field of `columns` independent `rows`-high box stacks on a static floor. */
const buildField = (columns: number, rows: number): { world: PhysicsWorld; bodies: PhysicsBody[] } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
  const size = 16;
  const spacing = 20;
  const floorTop = 1000;
  const width = columns * spacing + 200;

  world.createStaticCollider({ shape: new BoxShape(width, 40), position: { x: width / 2, y: floorTop + 20 }, friction: 0.5 });

  const bodies: PhysicsBody[] = [];

  for (let c = 0; c < columns; c++) {
    const x = 100 + c * spacing;

    for (let r = 0; r < rows; r++) {
      const body = world.createBody({ type: 'dynamic', position: { x, y: floorTop - size / 2 - 1 - r * size } });

      body.createCollider({ shape: new BoxShape(size, size), density: 1, friction: 0.5 });
      bodies.push(body);
    }
  }

  return { world, bodies };
};

const stepTimes = (world: PhysicsWorld, steps: number): number => {
  const start = performance.now();

  for (let i = 0; i < steps; i++) {
    world.step(FRAME);
  }

  return (performance.now() - start) / steps;
};

describe('physics dynamics performance (P-1 / P-2)', () => {
  it('1,000-body settled field: step time + steady-state allocation', () => {
    const { world, bodies } = buildField(200, 5);

    expect(bodies.length).toBe(1000);

    // Settle to steady state (warm-start active, contacts persistent).
    for (let i = 0; i < 240; i++) {
      world.step(FRAME);
    }

    // P-2 — steady-state step time.
    const msPerStep = stepTimes(world, 180);

    // P-1 — retained heap delta across steady-state steps.
    forceGc?.();
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 300; i++) {
      world.step(FRAME);
    }

    forceGc?.();
    const heapAfter = process.memoryUsage().heapUsed;
    const bytesPerStep = (heapAfter - heapBefore) / 300;

    console.log(`[P-2] ${msPerStep.toFixed(3)} ms/step · 1,000 bodies (${(1000 / msPerStep).toFixed(0)} body-steps/ms · ${(16.67 / msPerStep).toFixed(0)}× headroom at 60fps)`);
    console.log(`[P-1] ${(bytesPerStep / 1024).toFixed(2)} KB/step retained heap${forceGc ? ' (forced GC)' : ' (upper bound, no --expose-gc)'}`);

    // Sanity: nothing exploded.
    for (const body of bodies) {
      expect(Number.isFinite(body.x)).toBe(true);
      expect(Number.isFinite(body.y)).toBe(true);
    }

    // Catastrophic-regression guard only (P-2 is recorded, not tightly enforced).
    expect(msPerStep).toBeLessThan(100);

    // With forced GC the steady-state allocation should be near zero (pooling).
    if (forceGc) {
      expect(bytesPerStep).toBeLessThan(8 * 1024);
    }
  });
});
