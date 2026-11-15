// @vitest-environment node

import { resolve } from 'node:path';

import { selectCompetitiveAcquisitionDestination } from '../src/competitive/outputDirectory';
import { parseCompetitiveOptions } from '../src/competitive/plan';

describe('competitive output selection', () => {
  test('allocates an unused sibling for repeated implicit invocations and forwards it to every worker', () => {
    const args = ['--mode=standard', '--backend=webgl2'];
    const options = parseCompetitiveOptions(args);
    const occupied = new Set([resolve('run-competitive'), resolve('run-competitive-001'), resolve('run-competitive-002')]);
    const selected = selectCompetitiveAcquisitionDestination(options, args, path => occupied.has(path));

    expect(selected.options.out).toBe('run-competitive-003');
    expect(selected.workerArgs).toEqual([...args, '--out=run-competitive-003']);
    expect(parseCompetitiveOptions([...selected.workerArgs, '--worker=0']).out).toBe(selected.options.out);
  });

  test('uses the base name when no output already exists', () => {
    const args = ['--mode=quick'];
    const selected = selectCompetitiveAcquisitionDestination(parseCompetitiveOptions(args), args, () => false);

    expect(selected.options.out).toBe('run-competitive');
    expect(selected.workerArgs).toEqual([...args, '--out=run-competitive']);
  });

  test.each([
    ['--out=run-custom'],
    ['--out', 'run-custom'],
  ])('does not replace an explicitly requested output path: %s', (...tokens) => {
    const args = ['--mode=standard', ...tokens];
    const options = parseCompetitiveOptions(args);
    const exists = vi.fn(() => true);
    const selected = selectCompetitiveAcquisitionDestination(options, args, exists);

    expect(selected.options.out).toBe('run-custom');
    expect(selected.workerArgs).toEqual(args);
    expect(exists).not.toHaveBeenCalled();
  });

  test('does not select independently in workers, report, dry-run or help mode', () => {
    for (const args of [
      ['--worker=0'],
      ['--report=run-competitive/competitive.json'],
      ['--dry-run'],
      ['--help'],
    ]) {
      const options = parseCompetitiveOptions(args);
      const exists = vi.fn(() => true);
      const selected = selectCompetitiveAcquisitionDestination(options, args, exists);

      expect(selected.options).toBe(options);
      expect(selected.workerArgs).toEqual(args);
      expect(exists).not.toHaveBeenCalled();
    }
  });
});
