import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { PhysicsProvenance } from '../src/physics/driver';
import type { PhysicsCellResult } from '../src/physics/PhysicsAdapter';
import { type PhysicsReportData, writePhysicsReport } from '../src/physics/report';
import type { Provenance } from '../src/rendering/driver';
import type { ArchetypeId, Backend, CellResult } from '../src/rendering/EngineAdapter';
import { type ReportData, writeReport } from '../src/rendering/report';
import { mergeCellResults, mergeLibraries } from '../src/shared/report';

const cell = (options: {
  archetype: ArchetypeId;
  nodeCount: number;
  cpuMsMedian: number;
  backend?: Backend;
  status?: CellResult['status'];
  engine?: string;
}): CellResult => ({
  spec: {
    engine: options.engine ?? 'exojs',
    config: 'current',
    backend: options.backend ?? 'webgl2',
    archetype: options.archetype,
    nodeCount: options.nodeCount,
    timedFrames: 60,
    warmupFrames: 10,
  },
  cpuMsMedian: options.cpuMsMedian,
  cpuMsP95: options.cpuMsMedian * 1.2,
  frameMsMedian: null,
  frameMsP95: null,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 1, textureBinds: 1, bufferUploads: 1 },
  status: options.status ?? 'ok',
});

const stamp = (backend: Backend, timestamp: string): Provenance => ({
  adapter: 'Test GPU',
  backend,
  browser: 'chromium',
  browserVersion: '151.0.7922.34',
  os: 'win32 10.0.26200',
  platformVersion: { major: 11, source: 'detected', evidence: "os.release() reported '10.0.26200'" },
  prerelease: { value: false, source: 'assumed-stable', evidence: 'no marker, none declared' },
  flags: [],
  headless: true,
  software: false,
  engineVersion: '0.17.0',
  timestamp,
});

const physicsCell = (
  archetype: PhysicsCellResult['spec']['archetype'],
  bodyCount: number,
  stepMsMedian: number,
  status: PhysicsCellResult['status'] = 'ok',
): PhysicsCellResult => ({
  spec: { engine: 'exojs-physics', config: 'native', archetype, bodyCount, warmupSteps: 10, timedSteps: 60 },
  stepMsMedian,
  stepMsP95: stepMsMedian * 1.2,
  stepsPerSample: 1,
  structural: { bodyCount, contactCount: 50, jointCount: 0, rayHits: 0 },
  status,
});

const physicsStamp = (browserVersion: string): PhysicsProvenance => ({
  browser: 'chromium',
  browserVersion,
  host: {
    cpu: 'Test CPU',
    cpuCount: 16,
    os: 'linux 6.1.0',
    platformVersion: { major: 26, source: 'declared', evidence: "the runner declared '26'" },
    arch: 'x64',
  },
  prerelease: { value: false, source: 'assumed-stable', evidence: 'no marker, none declared' },
  engineVersion: '0.17.0',
  timestamp: '2026-01-01T00:00:00.000Z',
  fixedDelta: 1 / 60,
  clock: { resolutionMs: 0.005, crossOriginIsolated: true },
  caveats: [],
});

const readJson = <T>(dir: string): T => JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')) as T;

describe('mergeCellResults', () => {
  const a = cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.8 });
  const b = cell({ archetype: 'static-heavy', nodeCount: 5000, cpuMsMedian: 1.0 });

  test('keeps every existing cell the incoming run did not measure', () => {
    const merged = mergeCellResults([a, b], [cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.4 })]);

    expect(merged.map(result => [result.spec.archetype, result.cpuMsMedian])).toEqual([
      ['lifecycle-churn', 2.4],
      ['static-heavy', 1.0],
    ]);
  });

  test('an ok incoming cell replaces the existing cell with the same spec, in place', () => {
    const merged = mergeCellResults([b, a], [cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.4 })]);

    expect(merged[1]?.cpuMsMedian).toBe(2.4);
    expect(merged).toHaveLength(2);
  });

  test('a non-ok incoming cell leaves an existing cell untouched', () => {
    const exceeded = cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 99, status: 'exceeded' });

    expect(mergeCellResults([a], [exceeded])).toEqual([a]);
  });

  test('a non-ok incoming cell is still added when no cell with that spec exists', () => {
    const unavailable = cell({ archetype: 'text-dynamic', nodeCount: 5000, cpuMsMedian: 0, status: 'unavailable' });

    expect(mergeCellResults([a], [unavailable])).toEqual([a, unavailable]);
  });

  test('a differing spec field is a different cell, not an overwrite', () => {
    const webgpu = cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 3.0, backend: 'webgpu' });

    expect(mergeCellResults([a], [webgpu])).toEqual([a, webgpu]);
  });

  test('spec key order does not affect identity', () => {
    const reordered = {
      ...a,
      cpuMsMedian: 2.4,
      spec: { nodeCount: 5000, archetype: 'lifecycle-churn', backend: 'webgl2', config: 'current', engine: 'exojs', warmupFrames: 10, timedFrames: 60 },
    } as CellResult;
    const merged = mergeCellResults([a], [reordered]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.cpuMsMedian).toBe(2.4);
  });
});

describe('mergeLibraries', () => {
  test('a resolved incoming arm replaces the existing entry; an unresolved one does not clobber a resolved one', () => {
    const existing = [
      { name: 'pixi.js', version: '8.0.0', resolvedFrom: '/a/pixi/package.json' },
      { name: 'phaser', version: '4.0.0', resolvedFrom: '/a/phaser/package.json' },
    ];
    const incoming = [
      { name: 'pixi.js', version: '8.1.0', resolvedFrom: '/b/pixi/package.json' },
      { name: 'phaser', version: 'not-installed', resolvedFrom: '' },
      { name: 'excalibur', version: 'not-installed', resolvedFrom: '' },
    ];

    expect(mergeLibraries(existing, incoming)).toEqual([
      { name: 'pixi.js', version: '8.1.0', resolvedFrom: '/b/pixi/package.json' },
      { name: 'phaser', version: '4.0.0', resolvedFrom: '/a/phaser/package.json' },
      { name: 'excalibur', version: 'not-installed', resolvedFrom: '' },
    ]);
  });
});

describe('writeReport merges into an existing results.json', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'exojs-bench-report-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('without a prior report, writes the run as-is', () => {
    const data: ReportData = {
      provenance: [stamp('webgl2', 't1')],
      libraries: [],
      results: [cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.8 })],
    };
    writeReport(data, dir);

    expect(readJson<ReportData>(dir)).toEqual(data);
    expect(existsSync(join(dir, 'results.csv'))).toBe(true);
    expect(existsSync(join(dir, 'results.md'))).toBe(true);
  });

  test('a subset rerun replaces only the cells it measured ok, and only the provenance of the backends it ran', () => {
    const first: ReportData = {
      provenance: [stamp('webgl2', 't1'), stamp('webgpu', 't1')],
      libraries: [{ name: 'pixi.js', version: '8.0.0', resolvedFrom: '/a' }],
      results: [
        cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.8 }),
        cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 3.2, backend: 'webgpu' }),
        cell({ archetype: 'static-heavy', nodeCount: 5000, cpuMsMedian: 1.0 }),
        cell({ archetype: 'static-heavy', nodeCount: 5000, cpuMsMedian: 4.0, engine: 'pixi' }),
      ],
    };
    writeReport(first, dir);

    const rerun: ReportData = {
      provenance: [stamp('webgl2', 't2')],
      libraries: [{ name: 'pixi.js', version: 'not-installed', resolvedFrom: '' }],
      results: [
        cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.4 }),
        cell({ archetype: 'static-heavy', nodeCount: 5000, cpuMsMedian: 50, status: 'exceeded' }),
      ],
    };
    writeReport(rerun, dir);

    const merged = readJson<ReportData>(dir);

    expect(merged.provenance.map(entry => [entry.backend, entry.timestamp])).toEqual([
      ['webgl2', 't2'],
      ['webgpu', 't1'],
    ]);
    expect(merged.libraries).toEqual(first.libraries);
    expect(merged.results.map(result => [result.spec.engine, result.spec.backend, result.spec.archetype, result.cpuMsMedian, result.status])).toEqual([
      ['exojs', 'webgl2', 'lifecycle-churn', 2.4, 'ok'],
      ['exojs', 'webgpu', 'lifecycle-churn', 3.2, 'ok'],
      ['exojs', 'webgl2', 'static-heavy', 1.0, 'ok'],
      ['pixi', 'webgl2', 'static-heavy', 4.0, 'ok'],
    ]);

    const csv = readFileSync(join(dir, 'results.csv'), 'utf8');

    expect(csv.split('\n').filter(line => line.length > 0)).toHaveLength(5);
    expect(csv).toContain('2.400');
    expect(csv).not.toContain('2.800');
    expect(readFileSync(join(dir, 'results.md'), 'utf8')).toContain('| 2.400 |');
  });

  test('an unreadable prior report is refused rather than silently replaced', () => {
    writeFileSync(join(dir, 'results.json'), '{ not json');
    const data: ReportData = {
      provenance: [stamp('webgl2', 't1')],
      libraries: [],
      results: [cell({ archetype: 'lifecycle-churn', nodeCount: 5000, cpuMsMedian: 2.8 })],
    };

    expect(() => writeReport(data, dir)).toThrow(/results\.json/);
  });
});

describe('writePhysicsReport merges into an existing results.json', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'exojs-bench-physics-report-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('a subset rerun replaces only the cells it measured ok and takes the newer provenance stamp', () => {
    const first: PhysicsReportData = {
      provenance: physicsStamp('150.0'),
      libraries: [],
      results: [physicsCell('box-stack', 3000, 4.0), physicsCell('joints', 1000, 9.0)],
    };
    writePhysicsReport(first, dir);

    const rerun: PhysicsReportData = {
      provenance: physicsStamp('151.0'),
      libraries: [],
      results: [physicsCell('joints', 1000, 7.0), physicsCell('box-stack', 3000, 99, 'exceeded')],
    };
    writePhysicsReport(rerun, dir);

    const merged = readJson<PhysicsReportData>(dir);

    expect(merged.provenance.browserVersion).toBe('151.0');
    expect(merged.results.map(result => [result.spec.archetype, result.stepMsMedian])).toEqual([
      ['box-stack', 4.0],
      ['joints', 7.0],
    ]);
  });
});
