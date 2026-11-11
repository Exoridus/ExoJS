// @vitest-environment node

import { competitiveMatrixOptions, competitivePlan, parseCompetitiveOptions } from '../src/competitive/plan';
import { cellTimeoutMs, resolveMatrixCells } from '../src/rendering/driver';

describe('competitive acquisition plan', () => {
  test('defaults to a bounded CPU smoke and reserves detailed campaigns for explicit modes', () => {
    const quick = parseCompetitiveOptions([]);
    expect(quick.mode).toBe('quick');
    expect(quick.profile).toBe('timing');
    expect(quick.scenarios).toEqual(['dirty-0', 'dirty-100', 'lifecycle-churn']);
    expect(quick.runs).toBe(1);
    const focused = parseCompetitiveOptions(['--mode=focused', '--scenario=dirty-10']);
    expect([focused.warmupFrames, focused.frames, focused.runs, focused.profile]).toEqual([30, 120, 3, 'timing']);
    expect(() => parseCompetitiveOptions(['--mode=focused'])).toThrow(/scenario/);
    const full = parseCompetitiveOptions(['--mode=full']);
    expect([full.warmupFrames, full.frames, full.runs, full.profile]).toEqual([90, 300, 7, 'deep']);
    expect(full.scenarios.length).toBeGreaterThan(quick.scenarios.length);
    expect(parseCompetitiveOptions(['--mode=quick', '--profile=deep']).profile).toBe('deep');
  });

  test('resolves B03 through the existing capability-gated matrix at identical loads', () => {
    const options = parseCompetitiveOptions(['--scenario=B03', '--backend=webgl2', '--load=low', '--mode=quick']);
    const cells = resolveMatrixCells(competitiveMatrixOptions(options, 0));
    expect(new Set(cells.map(cell => cell.archetype)).size).toBe(7);
    expect(new Set(cells.map(cell => cell.engine))).toEqual(new Set(['exojs', 'pixi', 'phaser']));
    expect(cells.every(cell => cell.nodeCount === 1000 && cell.timedFrames === 5 && cell.warmupFrames === 2)).toBe(true);
    expect(cells.every(cell => cell.measurement?.profile === 'timing')).toBe(true);
  });

  test('keeps requested unavailable engine/backend combinations visible in the plan', () => {
    const options = parseCompetitiveOptions(['--scenario=B03', '--engine=phaser', '--backend=webgpu']);
    expect(competitivePlan(options).workloads).toHaveLength(7);
    expect(resolveMatrixCells(competitiveMatrixOptions(options, 0))).toEqual([]);
  });

  test('cycles remain within an arm session and are not statistical repetitions', () => {
    const options = parseCompetitiveOptions(['--scenario=dirty-0', '--engine=exojs', '--config=current', '--mode=long-run', '--cycles=3']);
    const cells = resolveMatrixCells(competitiveMatrixOptions(options, 0));
    expect(options.runs).toBe(1);
    expect(cells.map(cell => cell.measurement?.cycle).sort()).toEqual([0, 1, 2]);
  });

  test.each([
    '--runs=0',
    '--frames=1x',
    '--cycles=2.1',
    '--engine=typo',
    '--backend=webgl',
    '--profile=estimated-gpu',
    '--unknown=true',
    '--scenario=B07',
    '--nodes=1000 5000',
  ])('rejects malformed or unsupported input before launching: %s', value => {
    expect(() => parseCompetitiveOptions([value])).toThrow();
  });

  test('rejects meaningless flags and separates report-only inputs from acquisition', () => {
    expect(() => parseCompetitiveOptions(['--mode=standard', '--cycles=2'])).toThrow(/long-run/);
    expect(() => parseCompetitiveOptions(['--mode=quick', '--software=false'])).toThrow(/boolean/);
    expect(parseCompetitiveOptions(['--report=run/results.json']).report).toBe('run/results.json');
  });

  test('allows long requested sampling windows below display refresh rate without calling them driver wedges', () => {
    const options = parseCompetitiveOptions(['--scenario=dirty-0', '--frames=3000']);
    const [cell] = resolveMatrixCells(competitiveMatrixOptions(options, 0));
    expect(cellTimeoutMs(cell!)).toBeGreaterThan((3000 * 1000) / 30);
    const { measurement: _measurement, ...legacy } = cell!;
    expect(cellTimeoutMs(legacy)).toBe(60_000);
  });
});
