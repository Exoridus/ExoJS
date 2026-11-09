import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CompetitiveOptions } from '../src/competitive/plan';
import { analyzeCompetitiveSession, compareCompetitiveSessions, writeCompetitiveReport } from '../src/competitive/report';
import type { CompetitiveRun, CompetitiveSession } from '../src/competitive/types';
import type { Provenance } from '../src/rendering/driver';
import type { CellResult, CellSpec } from '../src/rendering/EngineAdapter';

type ObservedCell = CellResult & { renderer?: { backend: 'webgl2' | 'webgpu'; adapter: string } };

const adapter = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11, D3D11)';
const options: CompetitiveOptions = {
  mode: 'standard',
  profile: 'deep',
  engines: ['exojs', 'pixi'],
  configs: ['current', 'retained', 'default'],
  backends: ['webgl2'],
  scenarios: ['dirty-10'],
  load: 'low',
  frames: 3,
  warmupFrames: 2,
  runs: 2,
  cycles: 1,
  out: 'unused',
  software: false,
  capture: true,
  dryRun: false,
  help: false,
  list: false,
  machine: 'reference workstation',
  driver: 'declared driver 1',
  power: 'AC, performance mode',
  background: 'idle',
};

const cell = (engine = 'exojs', overrides: Partial<CellSpec> = {}, samples: readonly number[] = [1, 2, 50]): ObservedCell => {
  const spec: CellSpec = {
    engine,
    config: engine === 'exojs' ? 'current' : 'default',
    backend: 'webgl2',
    archetype: 'dirty-10',
    nodeCount: 1000,
    timedFrames: samples.length,
    warmupFrames: 2,
    measurement: { profile: 'deep', cycle: 0 },
    ...overrides,
  };

  return {
    spec,
    status: 'ok',
    cpuMsMedian: 2,
    cpuMsP95: 50,
    frameMsMedian: 0.7,
    frameMsP95: 0.9,
    queueMsMedian: null,
    queueMsP95: null,
    frameTimeSource: 'webgl2-time-elapsed',
    structural: { drawCalls: 1, textureBinds: 1, bufferUploads: 1 },
    clock: { resolutionMs: 0.005, crossOriginIsolated: true },
    renderer: { backend: spec.backend, adapter },
    telemetry: {
      schemaVersion: 1,
      profile: 'deep',
      frameTimeSource: 'webgl2-time-elapsed',
      cpuMs: samples,
      updateMs: [0.2, 0.3, 0.4],
      submissionMs: [0.8, 1.7, 49.6],
      rafMs: [16, 17],
      gpu: {
        frameMs: [0.5, 0.7, 0.9],
        queueMs: [],
        frameIndices: [0, 1, 2],
        timing: {
          source: 'webgl2-time-elapsed',
          status: 'complete',
          attemptedFrames: 3,
          validFrames: 3,
          invalidFrames: 0,
          unresolvedFrames: 0,
          skippedFrames: 0,
        },
      },
      api: {
        bufferUploadCalls: 3,
        bufferUploadBytes: 96,
        bufferAllocationCalls: 0,
        bufferAllocationBytes: 0,
        textureUploadCalls: 0,
        programBinds: 3,
        pipelineBinds: 0,
        renderPasses: 0,
        queueSubmits: 0,
        buffersCreated: 0,
        buffersDestroyed: 0,
        texturesCreated: 0,
        texturesDestroyed: 0,
        shaderCompilations: 0,
        pipelineCreations: 0,
      },
      structuralTotals: { drawCalls: 6, textureBinds: 9, bufferUploads: 12 },
      heap: [
        { phase: 'after-warmup', frame: -1, elapsedMs: 5, usedJSHeapBytes: 1000 },
        { phase: 'after-teardown', frame: -1, elapsedMs: 80, usedJSHeapBytes: null },
      ],
      warmup: { requestedFrames: 2, completedFrames: 2, elapsedMs: 32 },
      measurementElapsedMs: 70,
      mutation: {
        nominalFraction: Number(spec.archetype.split('-')[1] ?? 10) / 100,
        selectedCount: 100,
        signature: 'canonical-selection',
        verified: true,
      },
      viewport: { width: 1280, height: 720, dpr: 1 },
    },
  };
};

const stamp = (backend: 'webgl2' | 'webgpu'): Provenance => ({
  backend,
  adapter,
  browser: 'chromium',
  browserVersion: '151.0.7922.34',
  os: 'linux 6.8',
  platformVersion: { major: 24, source: 'declared', evidence: 'declared 24' },
  prerelease: { value: false, source: 'declared', evidence: 'stable release' },
  flags: ['--enable-webgl'],
  headless: true,
  software: false,
  clock: { resolutionMs: 0.005, crossOriginIsolated: true },
  engineVersion: '0.22.0',
  timestamp: '2026-11-09T15:00:00Z',
});

const run = (runIndex: number, cells: readonly ObservedCell[]): CompetitiveRun => ({
  schemaVersion: 1,
  runId: `independent-${runIndex}`,
  runIndex,
  protocolHash: 'protocol-1',
  startedAt: '2026-11-09T15:00:00Z',
  finishedAt: '2026-11-09T15:01:00Z',
  error: null,
  source: {
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    dirty: false,
    trackedDiffSha256: 'c'.repeat(64),
    workspaceLockSha256: 'd'.repeat(64),
    competitorLockSha256: 'e'.repeat(64),
  },
  host: {
    os: 'linux 6.8',
    cpu: 'declared CPU',
    logicalCpus: 16,
    totalMemoryBytes: 32 * 1024 ** 3,
    nodeVersion: 'v26.0.0',
    machine: options.machine,
    driver: options.driver,
    power: options.power,
    background: options.background,
  },
  outcome: {
    provenance: [...new Set(cells.map(result => result.spec.backend))].map(stamp),
    libraries: [{ name: 'pixi.js', version: '8.19.0', resolvedFrom: '/dependencies/pixi/package.json' }],
    results: [...cells],
  },
});

const session = (
  cells: readonly ObservedCell[] = [cell(), cell('pixi')],
  overrides: Partial<CompetitiveOptions> = {},
): CompetitiveSession => {
  const settings = { ...options, ...overrides };

  return {
    schemaVersion: 1,
    kind: 'exojs-competitive',
    createdAt: '2026-11-09T15:02:00Z',
    protocolHash: 'protocol-1',
    options: settings,
    plannedCells: cells.map(result => result.spec),
    runs: Array.from({ length: settings.runs }, (_, index) => run(index, cells)),
  };
};

const mapRuns = (input: CompetitiveSession, change: (value: CompetitiveRun, index: number) => CompetitiveRun): CompetitiveSession => ({
  ...input,
  runs: input.runs.map(change),
});

describe('competitive report evidence', () => {
  test('keeps per-acquisition distributions and labels every output diagnostic', () => {
    const report = analyzeCompetitiveSession(session());
    const observation = report.cells[0]!.observations[0]!;

    expect(report.status).toBe('DIAGNOSTIC_ONLY');
    expect(observation.cpu).toMatchObject({ count: 3, median: 2, p95: 50, p99: 50, max: 50, stutters: 1 });
    expect(observation.cpu!.variance).toBeCloseTo(522.8888888889);
    expect(observation.update!.median).toBe(0.3);
    expect(observation.submission!.median).toBe(1.7);
    expect(observation.gpu!.median).toBe(0.7);
    expect(observation.raf!.median).toBe(16.5);
    expect(observation.api!.bufferUploadBytes).toBe(96);
    expect(observation.apiPerFrame!.bufferUploadBytes).toBe(32);
    expect(observation.structuralPerFrame).toEqual({ drawCalls: 2, textureBinds: 3, bufferUploads: 4 });
    expect(observation.heap[1]!.usedJSHeapBytes).toBeNull();
    expect(report.comparisons[0]!.rankClaim).toBeNull();
  });

  test('does not relabel cadence observations as GPU measurements', () => {
    const result = cell();
    const cadence: ObservedCell = {
      ...result,
      frameTimeSource: 'raf-cadence',
      telemetry: { ...result.telemetry!, frameTimeSource: 'raf-cadence', gpu: { frameMs: [], queueMs: [] } },
    };
    const observation = analyzeCompetitiveSession(session([cadence])).cells[0]!.observations[0]!;

    expect(observation.gpu).toBeNull();
    expect(observation.frameSource).toBe('raf-cadence');
    expect(observation.frame!.median).toBe(16.5);
  });

  test.each(['missing', 'software', 'masked'] as const)('withholds comparative ratios for %s actual renderer evidence', kind => {
    const result = cell('pixi');
    const renderer =
      kind === 'missing' ? undefined : { backend: 'webgl2' as const, adapter: kind === 'software' ? 'Google SwiftShader' : 'Apple GPU' };
    const { renderer: _renderer, ...withoutRenderer } = result;
    const changed = renderer === undefined ? withoutRenderer : { ...result, renderer };
    const report = analyzeCompetitiveSession(session([cell(), changed]));

    expect(report.cells.find(entry => entry.spec.engine === 'pixi')!.qualification).toBe('UNQUALIFIED');
    expect(report.comparisons[0]!.exploratory).toBeNull();
    expect(report.comparisons[0]!.rankClaim).toBeNull();
    expect(report.cells[1]!.observations[0]!.cpu!.median).toBe(2);
  });

  test.each(['warmup', 'mutation', 'clock', 'samples', 'gpu-coverage'] as const)(
    'withholds comparison for incomplete %s evidence',
    kind => {
      const result = cell('pixi');
      const telemetry = {
        ...result.telemetry!,
        ...(kind === 'warmup' && { warmup: { requestedFrames: 2, completedFrames: 1, elapsedMs: 16 } }),
        ...(kind === 'mutation' && { mutation: { ...result.telemetry!.mutation, verified: false } }),
        ...(kind === 'samples' && { cpuMs: [1, Number.NaN, 50] }),
        ...(kind === 'gpu-coverage' && {
          gpu: {
            ...result.telemetry!.gpu,
            timing: { ...result.telemetry!.gpu.timing!, status: 'partial' as const, validFrames: 2, invalidFrames: 1 },
          },
        }),
      };
      const changed = { ...result, telemetry, ...(kind === 'clock' && { clock: { resolutionMs: 0.1, crossOriginIsolated: true } }) };
      const report = analyzeCompetitiveSession(session([cell(), changed]));

      expect(report.comparisons[0]!.qualification).toBe('UNQUALIFIED');
      expect(report.comparisons[0]!.exploratory).toBeNull();
    },
  );

  test('rejects repeated IDs and missing independent run indices', () => {
    const original = session();
    const duplicates = { ...original, runs: [original.runs[0]!, original.runs[0]!] };
    const missing = { ...original, options: { ...options, runs: 3 } };

    expect(analyzeCompetitiveSession(duplicates).comparisons[0]!.exploratory).toBeNull();
    expect(analyzeCompetitiveSession(duplicates).issues.join(' ')).toMatch(/duplicate.*run/i);
    expect(analyzeCompetitiveSession(missing).issues.join(' ')).toMatch(/missing.*run/i);
  });

  test('does not accept a graphics API version as a physical device identity', () => {
    const result = { ...cell('pixi'), renderer: { backend: 'webgl2' as const, adapter: 'WebGL2' } };
    const analysis = analyzeCompetitiveSession(session([cell(), result]));

    expect(analysis.cells[1]!.qualification).toBe('UNQUALIFIED');
    expect(analysis.comparisons[0]!.exploratory).toBeNull();
  });

  test.each(['machine', 'driver', 'power', 'background'] as const)('rejects an UNRECORDED %s declaration', field => {
    const original = session();
    const changed = mapRuns(original, value => ({ ...value, host: { ...value.host, [field]: 'UNRECORDED' } }));
    const analysis = analyzeCompetitiveSession(changed);

    expect(analysis.cells.every(entry => entry.qualification === 'UNQUALIFIED')).toBe(true);
    expect(analysis.issues.join(' ')).toMatch(/host.*undeclared/i);
    expect(analysis.comparisons[0]!.exploratory).toBeNull();
  });

  test('retains explicit missing observations and rows for a run that returned no cells', () => {
    const original = session([cell()]);
    const absent = mapRuns(original, value => ({ ...value, outcome: { ...value.outcome!, results: [] } }));
    const analysis = analyzeCompetitiveSession(absent);

    expect(analysis.cells[0]!.observations.map(observation => observation.status)).toEqual(['missing', 'missing']);
    expect(analysis.cells[0]!.observations.every(observation => observation.cpu === null)).toBe(true);
    expect(analysis.dirtyRates[0]!.points.every(point => point.cpuMs === null)).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), 'competitive-missing-'));

    try {
      writeCompetitiveReport(absent, directory);
      expect(readFileSync(join(directory, 'competitive.html'), 'utf8')).toContain('dirty-10');
      expect(readFileSync(join(directory, 'competitive.csv'), 'utf8')).toContain('dirty-10,1000,0,independent-0,0,missing,UNQUALIFIED');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test.each(['protocol', 'source', 'host', 'browser', 'flags', 'version', 'instrumentation'] as const)(
    'rejects incompatible %s across independent runs',
    kind => {
      const original = session();
      const changed = mapRuns(original, (value, index) => {
        if (index === 0) {
          return value;
        }

        return {
          ...value,
          ...(kind === 'protocol' && { protocolHash: 'other' }),
          ...(kind === 'source' && { source: { ...value.source, commit: 'f'.repeat(40) } }),
          ...(kind === 'host' && { host: { ...value.host, cpu: 'different CPU' } }),
          outcome: {
            ...value.outcome!,
            provenance: value.outcome!.provenance.map(provenance => ({
              ...provenance,
              ...(kind === 'browser' && { browserVersion: '152.0' }),
              ...(kind === 'flags' && { flags: ['--other'] }),
            })),
            libraries:
              kind === 'version'
                ? [{ name: 'pixi.js', version: '8.20.0', resolvedFrom: '/dependencies/pixi/package.json' }]
                : value.outcome!.libraries,
            results:
              kind === 'instrumentation'
                ? value.outcome!.results.map(result => ({ ...result, telemetry: { ...result.telemetry!, profile: 'timing' } }))
                : value.outcome!.results,
          },
        };
      });

      expect(analyzeCompetitiveSession(changed).comparisons[0]!.exploratory).toBeNull();
    },
  );

  test('counts repeated cycles once per independent invocation', () => {
    const cells = [0, 1, 2, 3, 4, 5, 6].flatMap(cycle => [
      cell('exojs', { measurement: { profile: 'deep', cycle } }, [1, 1, 1]),
      cell('pixi', { measurement: { profile: 'deep', cycle } }, [2, 2, 2]),
    ]);
    const report = analyzeCompetitiveSession(session(cells, { runs: 1, cycles: 7, mode: 'long-run' }));

    expect(report.cells[0]!.observations).toHaveLength(7);
    expect(report.comparisons[0]!.exploratory!.runs).toBe(1);
    expect(report.comparisons[0]!.exploratory!.status).toBe('INCONCLUSIVE');
  });

  test('does not pool distinct node loads or ExoJS configurations', () => {
    const cells = [1000, 10000].flatMap(nodeCount => [
      cell('exojs', { nodeCount }),
      cell('exojs', { nodeCount, config: 'retained' }),
      cell('pixi', { nodeCount }),
    ]);
    const report = analyzeCompetitiveSession(session(cells));

    expect(report.cells).toHaveLength(6);
    expect(report.comparisons).toHaveLength(4);
    expect(new Set(report.comparisons.map(entry => `${entry.reference.spec.config}:${entry.reference.spec.nodeCount}`))).toEqual(
      new Set(['current:1000', 'retained:1000', 'current:10000', 'retained:10000']),
    );
  });

  test('withholds a cell comparison when a run duplicates or omits its cycle', () => {
    const original = session();
    const changed = mapRuns(original, (value, index) =>
      index === 0 ? value : { ...value, outcome: { ...value.outcome!, results: [value.outcome!.results[0]!, value.outcome!.results[0]!] } },
    );
    const report = analyzeCompetitiveSession(changed);

    expect(report.comparisons[0]!.exploratory).toBeNull();
    expect(report.cells.every(entry => entry.qualification === 'UNQUALIFIED')).toBe(true);
  });

  test('leaves unmeasured dirty rates as gaps and only brackets an observed qualified reversal', () => {
    const cells = [
      cell('exojs', { archetype: 'dirty-10' }, [1, 1, 1]),
      cell('pixi', { archetype: 'dirty-10' }, [2, 2, 2]),
      cell('exojs', { archetype: 'dirty-25' }, [4, 4, 4]),
      cell('pixi', { archetype: 'dirty-25' }, [2, 2, 2]),
    ];
    const report = analyzeCompetitiveSession(session(cells, { runs: 7 }));

    expect(report.dirtyRates[0]!.points.map(point => point.rate)).toEqual([0, 1, 10, 25, 50, 75, 100]);
    expect(report.dirtyRates[0]!.points.map(point => point.cpuMs)).toEqual([null, null, 1, 4, null, null, null]);
    expect(report.breakEvenBrackets).toHaveLength(1);
    expect(report.breakEvenBrackets[0]!.rates).toEqual([10, 25]);
    const gapped = cells.map(result => ({
      ...result,
      spec: { ...result.spec, archetype: result.spec.archetype === 'dirty-10' ? ('dirty-1' as const) : result.spec.archetype },
    }));
    expect(analyzeCompetitiveSession(session(gapped, { runs: 7 })).breakEvenBrackets).toHaveLength(0);
  });

  test('writes escaped self-contained artifacts with measured numeric dirty-rate spacing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'competitive-report-'));

    try {
      const cells = [0, 1, 100].map(rate => ({
        ...cell('exojs', { archetype: `dirty-${rate}` as 'dirty-0' | 'dirty-1' | 'dirty-100' }),
        note: '<img src=x onerror=alert(1)>, "quoted"\r\nnext',
      }));
      writeCompetitiveReport(session(cells, { software: true }), directory);
      const html = readFileSync(join(directory, 'competitive.html'), 'utf8');
      const csv = readFileSync(join(directory, 'competitive.csv'), 'utf8');
      const markdown = readFileSync(join(directory, 'competitive.md'), 'utf8');
      const summary = JSON.parse(readFileSync(join(directory, 'competitive.summary.json'), 'utf8')) as { status: string };

      expect(summary.status).toBe('DIAGNOSTIC_ONLY');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toMatch(/<script\b|<link\b|https?:\/\//);
      expect(markdown).toContain('UNQUALIFIED');
      expect(csv).toContain('"<img src=x onerror=alert(1)>, ""quoted""\r\nnext"');
      const points = [...html.matchAll(/data-rate="(\d+)" cx="([\d.]+)"/g)].map(match => ({ rate: Number(match[1]), x: Number(match[2]) }));
      const [zero, one, hundred] = [0, 1, 100].map(rate => points.find(point => point.rate === rate)!);
      expect((one!.x - zero!.x) / (hundred!.x - zero!.x)).toBeCloseTo(0.01, 4);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('allows a clean revision comparison but rejects changed protocols or dependency locks', () => {
    const baseline = session(undefined, { runs: 7 });
    const current = mapRuns(baseline, value => ({ ...value, source: { ...value.source, commit: 'f'.repeat(40), tree: '0'.repeat(40) } }));
    const comparison = compareCompetitiveSessions(baseline, current);

    expect(comparison.status).toBe('DIAGNOSTIC_ONLY');
    expect(comparison.cells[0]!.exploratory!.ratio).toBe(1);
    expect(compareCompetitiveSessions(baseline, { ...current, protocolHash: 'changed' }).cells[0]!.exploratory).toBeNull();
    const changedLock = mapRuns(current, value => ({ ...value, source: { ...value.source, competitorLockSha256: '9'.repeat(64) } }));
    expect(compareCompetitiveSessions(baseline, changedLock).cells[0]!.exploratory).toBeNull();
  });
});
