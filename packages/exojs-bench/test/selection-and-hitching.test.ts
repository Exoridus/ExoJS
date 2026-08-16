import type { CellResult, CellSpec } from '../src/rendering/EngineAdapter';
import { isHitching } from '../src/rendering/report';
import { applySelection } from '../src/rendering/selection';

const cell = (overrides: Partial<CellSpec> = {}): CellSpec => ({
  engine: 'exojs',
  config: 'current',
  backend: 'webgl2',
  archetype: 'static-heavy',
  nodeCount: 1_000,
  timedFrames: 120,
  warmupFrames: 20,
  ...overrides,
});

const result = (cpuMsMedian: number, cpuMsP95: number): CellResult => ({
  spec: cell(),
  cpuMsMedian,
  cpuMsP95,
  frameMsMedian: 0,
  frameMsP95: 0,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 0, textureBinds: 0, bufferUploads: 0 },
  status: 'ok',
});

describe('applySelection', () => {
  const ladder = [cell({ nodeCount: 1_000 }), cell({ nodeCount: 25_000 }), cell({ nodeCount: 100_000 })];

  test('filters engines, configs and archetypes', () => {
    const cells = [...ladder, cell({ engine: 'pixi' }), cell({ config: 'retained' }), cell({ archetype: 'overdraw' })];

    const selected = applySelection(cells, { engines: ['exojs'], configs: ['current'], archetypes: ['static-heavy'] });

    expect(selected).toHaveLength(ladder.length);
    expect(selected.every(entry => entry.engine === 'exojs' && entry.config === 'current')).toBe(true);
  });

  test('runs a node count that is not on the archetype ladder', () => {
    const selected = applySelection(ladder, { nodeCounts: [1_000_000] });

    expect(selected.map(entry => entry.nodeCount)).toEqual([1_000_000]);
  });

  test('emits one cell per requested count without duplicating the arm', () => {
    const selected = applySelection(ladder, { nodeCounts: [250_000, 1_000_000] });

    expect(selected.map(entry => entry.nodeCount)).toEqual([250_000, 1_000_000]);
  });

  test('keeps one cell per arm and count when several arms survive', () => {
    const cells = [...ladder, cell({ engine: 'pixi', nodeCount: 1_000 }), cell({ engine: 'pixi', nodeCount: 25_000 })];

    const selected = applySelection(cells, { nodeCounts: [500_000] });

    expect(selected.map(entry => `${entry.engine} ${entry.nodeCount}`)).toEqual(['exojs 500000', 'pixi 500000']);
  });

  test('derives the frame budgets for an off-ladder count', () => {
    const [selected] = applySelection(ladder, { nodeCounts: [1_000_000] });

    // 1M sits in the same budget tier as 100k: 30 timed, 40 warmup.
    expect(selected).toMatchObject({ timedFrames: 30, warmupFrames: 40 });
  });
});

describe('isHitching', () => {
  test('marks a cell whose p95 towers over its median', () => {
    // scrolling-world at 1M: a full re-collect roughly every tenth frame.
    expect(isHitching(result(0.19, 400.155))).toBe(true);
  });

  test('does not mark a cell that is fast throughout', () => {
    // 5x the median, but the worst frame is still far inside any budget.
    expect(isHitching(result(0.1, 0.5))).toBe(false);
  });

  test('does not mark a cell that is uniformly slow', () => {
    // The median already reports this honestly; nothing is hiding behind it.
    expect(isHitching(result(30, 34))).toBe(false);
  });
});
