import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATE_GROUPS } from '../../scripts/ci/gate-groups';
import { PERF_RUNS, type PerfRunName } from '../../scripts/perf';

/**
 * The perf runner's table against the tree: every in-process run names a
 * module that exists, every composite names runs that exist, and the `smoke`
 * run the sync gate depends on covers each in-process benchmark - it exists to
 * catch those rotting against an API change, so one it skips is one that rots.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const runNames = Object.keys(PERF_RUNS) as PerfRunName[];

describe('perf runs', () => {
  it.each(runNames)('`%s` is a module, a command or a composite', name => {
    const run = PERF_RUNS[name];
    const kinds = ['module' in run, 'command' in run, 'runs' in run].filter(Boolean);
    expect(kinds).toHaveLength(1);
  });

  it.each(runNames.filter(name => 'module' in PERF_RUNS[name]))('`%s` names a module that exists', name => {
    const run = PERF_RUNS[name] as { module: string };
    expect(existsSync(resolve(repoRoot, run.module))).toBe(true);
  });

  it.each(runNames.filter(name => 'runs' in PERF_RUNS[name]))('`%s` composes runs that exist', name => {
    const run = PERF_RUNS[name] as { runs: readonly string[] };
    for (const child of run.runs) {
      expect(runNames).toContain(child);
    }
  });

  it('smokes every in-process benchmark under test/perf/*-benchmark.ts', () => {
    const benchmarks = runNames.filter(name => {
      const run = PERF_RUNS[name] as { module?: string };
      return run.module?.endsWith('-benchmark.ts') && !run.module.includes('profile');
    });
    for (const benchmark of benchmarks) {
      expect(PERF_RUNS.smoke.runs).toContain(benchmark);
    }
    expect(PERF_RUNS.smoke.runs).toContain('profile');
  });

  it('is what the sync gate runs as `perf:smoke`', () => {
    expect(GATE_GROUPS.sync).toContain('perf:smoke');
    expect(packageJson.scripts['perf:smoke']).toBe('pnpm perf smoke');
    expect(packageJson.scripts['perf']).toBe('tsx ./scripts/perf.ts');
  });
});
