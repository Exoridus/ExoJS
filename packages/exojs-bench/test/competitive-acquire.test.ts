// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireCompetitiveRun } from '../src/competitive/acquire';
import { type CompetitiveOptions, parseCompetitiveOptions } from '../src/competitive/plan';
import type { CompetitiveRun } from '../src/competitive/types';
import type { MatrixOutcome, runMatrix } from '../src/rendering/driver';
import type { CellResult } from '../src/rendering/EngineAdapter';

const mocks = vi.hoisted(() => ({ git: vi.fn(), runMatrix: vi.fn(), writeReport: vi.fn() }));

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: mocks.git,
}));
vi.mock('../src/rendering/driver', () => ({ runMatrix: mocks.runMatrix, SOFTWARE_LAUNCH_FLAGS: [] }));
vi.mock('../src/rendering/report', () => ({ writeReport: mocks.writeReport }));

const result: CellResult = {
  spec: {
    engine: 'exojs',
    config: 'current',
    backend: 'webgl2',
    archetype: 'dirty-10',
    nodeCount: 1000,
    timedFrames: 3,
    warmupFrames: 2,
    measurement: { profile: 'timing', cycle: 0 },
  },
  status: 'ok',
  cpuMsMedian: 1,
  cpuMsP95: 1,
  frameMsMedian: null,
  frameMsP95: null,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 0, textureBinds: 0, bufferUploads: 0 },
  clock: { resolutionMs: 0.005, crossOriginIsolated: true },
};
const outcome: MatrixOutcome = { provenance: [], libraries: [], results: [result] };

describe('competitive acquisition source identity', () => {
  let directory: string;
  let options: CompetitiveOptions;
  let source: { commit: string; tree: string; status: string; diff: string };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    directory = mkdtempSync(join(tmpdir(), 'competitive-acquire-'));
    const repository = join(directory, 'source');
    mkdirSync(join(repository, 'packages/exojs-bench/competitors'), { recursive: true });
    writeFileSync(join(repository, 'pnpm-lock.yaml'), 'workspace lock fixture');
    writeFileSync(join(repository, 'packages/exojs-bench/competitors/pnpm-lock.yaml'), 'competitor lock fixture');
    source = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), status: '', diff: '' };
    mocks.git.mockImplementation((command: string, args: readonly string[]) => {
      expect(command).toBe('git');

      switch (args.join(' ')) {
        case 'rev-parse --show-toplevel':
          return repository;
        case 'rev-parse HEAD':
          return source.commit;
        case 'rev-parse HEAD^{tree}':
          return source.tree;
        case 'status --porcelain':
          return source.status;
        case 'diff --binary HEAD':
          return Buffer.from(source.diff);
        default:
          throw new Error(`Unexpected Git query: ${args.join(' ')}`);
      }
    });
    options = parseCompetitiveOptions([
      '--mode=quick',
      '--profile=timing',
      '--scenario=dirty-10',
      '--engine=exojs',
      '--config=current',
      '--frames=3',
      '--warmup-frames=2',
      `--out=${join(directory, 'output')}`,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  const saved = (): CompetitiveRun => JSON.parse(readFileSync(join(options.out, 'run-001/acquisition.json'), 'utf8')) as CompetitiveRun;
  const checkpointed = (): CellResult => JSON.parse(readFileSync(join(options.out, 'run-001/cells.jsonl'), 'utf8')) as CellResult;

  test('persists matching source identities and the completed outcome for an unchanged acquisition', async () => {
    mocks.runMatrix.mockImplementation(async (request: Parameters<typeof runMatrix>[0]) => {
      request.onCellResult?.(result);

      return outcome;
    });

    const run = await acquireCompetitiveRun(options, 0);

    expect(run.error).toBeNull();
    expect(run.sourceAfter).toEqual(run.source);
    expect(run.outcome).toEqual(outcome);
    expect(saved()).toEqual(run);
    expect(checkpointed()).toEqual(result);
  });

  test.each(['working tree', 'clean revision'] as const)('keeps completed evidence but rejects a changed %s', async change => {
    mocks.runMatrix.mockImplementation(async (request: Parameters<typeof runMatrix>[0]) => {
      request.onCellResult?.(result);
      source =
        change === 'working tree'
          ? { ...source, status: ' M src/rendering/fixture.ts', diff: 'changed source fixture' }
          : { ...source, commit: 'c'.repeat(40), tree: 'd'.repeat(40) };

      return outcome;
    });

    const run = await acquireCompetitiveRun(options, 0);

    expect(run.error).toMatch(/source identity changed during acquisition.*cannot be compared/i);
    expect(run.source).toMatchObject({ commit: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: false });
    expect(run.sourceAfter).not.toEqual(run.source);
    expect(run.sourceAfter?.dirty).toBe(change === 'working tree');
    expect(run.outcome).toEqual(outcome);
    expect(saved()).toEqual(run);
    expect(checkpointed()).toEqual(result);
  });

  test('preserves the original acquisition failure and checkpoint when source identity also changes', async () => {
    mocks.runMatrix.mockImplementation(async (request: Parameters<typeof runMatrix>[0]) => {
      request.onCellResult?.(result);
      source = { ...source, status: ' M src/rendering/fixture.ts', diff: 'changed source fixture' };

      throw new Error('Browser disconnected after the completed cell.');
    });

    const run = await acquireCompetitiveRun(options, 0);

    expect(run.error).toContain('Browser disconnected after the completed cell.');
    expect(run.error).toMatch(/source identity changed during acquisition/i);
    expect(run.sourceAfter?.dirty).toBe(true);
    expect(run.outcome).toBeNull();
    expect(saved()).toEqual(run);
    expect(checkpointed()).toEqual(result);
  });
});
