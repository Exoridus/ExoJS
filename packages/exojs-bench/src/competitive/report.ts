import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Provenance } from '../rendering/driver';
import type { CellResult, CellSpec, StructuralCounters } from '../rendering/EngineAdapter';
import type { ApiCounters, CellTelemetry, HeapSample } from '../rendering/telemetry';
import { csvField, markdownCell } from '../shared/report';
import { compareRunMedians, type FrameTimeSource, type RunComparison, type SampleSummary, summarizeSamples } from './metrics';
import type { CompetitiveRun, CompetitiveSession } from './types';

type Qualification = 'NUMERICALLY_QUALIFIED' | 'UNQUALIFIED';
type ObservedCell = CellResult & { readonly renderer?: { readonly backend: string | null; readonly adapter: string | null } };
type ObservedTelemetry = CellTelemetry & { readonly structuralTotals?: Readonly<StructuralCounters> | null };

export interface CompetitiveObservation {
  readonly runIndex: number;
  readonly runId: string;
  readonly cycle: number;
  readonly status: string;
  readonly note: string | null;
  readonly reasons: readonly string[];
  readonly identity: string | null;
  readonly cpu: SampleSummary | null;
  readonly update: SampleSummary | null;
  readonly submission: SampleSummary | null;
  readonly frame: SampleSummary | null;
  readonly gpu: SampleSummary | null;
  readonly raf: SampleSummary | null;
  readonly queue: SampleSummary | null;
  readonly frameSource: FrameTimeSource;
  readonly gpuCoverage: CellTelemetry['gpu']['timing'] | null;
  readonly api: Readonly<ApiCounters> | null;
  readonly apiPerFrame: Readonly<ApiCounters> | null;
  readonly structuralTotals: Readonly<StructuralCounters> | null;
  readonly structuralPerFrame: Readonly<StructuralCounters> | null;
  readonly heap: readonly HeapSample[];
  readonly warmup: CellTelemetry['warmup'] | null;
  readonly mutation: CellTelemetry['mutation'] | null;
  readonly clockResolutionMs: number | null;
}

export interface CompetitiveCellSummary {
  readonly key: string;
  readonly spec: CellSpec;
  readonly qualification: Qualification;
  readonly reasons: readonly string[];
  readonly observations: readonly CompetitiveObservation[];
  readonly runMedians: ReadonlyArray<{ readonly runIndex: number; readonly cpuMs: number }>;
  readonly medianCpuMs: number | null;
  readonly identity: string | null;
}

type CellLabel = Pick<CompetitiveCellSummary, 'key' | 'spec'>;

export interface CompetitiveComparison {
  readonly reference: CellLabel;
  readonly competitor: CellLabel;
  readonly qualification: Qualification;
  readonly reasons: readonly string[];
  readonly exploratory: RunComparison | null;
  readonly rankClaim: null;
}

export interface DirtyRateSeries {
  readonly engine: string;
  readonly config: string;
  readonly backend: string;
  readonly nodeCount: number;
  readonly points: ReadonlyArray<{
    readonly rate: number;
    readonly cpuMs: number | null;
    readonly qualification: Qualification;
    readonly runs: number;
  }>;
}

export interface CompetitiveAnalysis {
  readonly schemaVersion: 1;
  readonly status: 'DIAGNOSTIC_ONLY';
  readonly protocolHash: string;
  readonly createdAt: string;
  readonly issues: readonly string[];
  readonly cells: readonly CompetitiveCellSummary[];
  readonly comparisons: readonly CompetitiveComparison[];
  readonly dirtyRates: readonly DirtyRateSeries[];
  readonly breakEvenBrackets: ReadonlyArray<{
    readonly reference: string;
    readonly competitor: string;
    readonly backend: string;
    readonly nodeCount: number;
    readonly rates: readonly [number, number];
  }>;
}

const DIRTY_RATES = [0, 1, 10, 25, 50, 75, 100] as const;
const SOURCES: readonly FrameTimeSource[] = ['webgl2-time-elapsed', 'webgpu-render-pass-timestamps', 'raf-cadence', 'unavailable'];
const unique = (values: readonly string[]): string[] => [...new Set(values)];
const keyOf = (spec: CellSpec): string => JSON.stringify([spec.engine, spec.config, spec.backend, spec.archetype, spec.nodeCount]);
const cycleOf = (spec: CellSpec): number => spec.measurement?.cycle ?? 0;
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const qualification = (reasons: readonly string[]): Qualification => (reasons.length === 0 ? 'NUMERICALLY_QUALIFIED' : 'UNQUALIFIED');
const same = (values: readonly string[]): boolean => new Set(values).size <= 1;
const known = (value: string): boolean =>
  value.trim().length > 0 &&
  !/^(?:unknown|unavailable|undeclared|unrecorded|not[- ](?:declared|installed)|unreadable|n\/?a)$/i.test(value.trim());

const inspectSession = (session: CompetitiveSession): string[] => {
  const issues: string[] = [];
  const indices = session.runs.map(run => run.runIndex).sort((a, b) => a - b);
  const contiguous = indices.every((index, position) => index === position) || indices.every((index, position) => index === position + 1);

  if (session.schemaVersion !== 1 || session.kind !== 'exojs-competitive' || !known(session.protocolHash)) {
    issues.push('Unsupported session schema or missing protocol identity.');
  }

  if (session.plannedCells.length === 0) {
    issues.push('No planned cells.');
  }

  if (new Set(indices).size !== indices.length || new Set(session.runs.map(run => run.runId)).size !== session.runs.length) {
    issues.push('Duplicate independent run index or run ID.');
  }

  if (session.runs.length !== session.options.runs || !contiguous) {
    issues.push('Missing or unexpected independent runs.');
  }

  if (
    !Number.isSafeInteger(session.options.runs) ||
    session.options.runs < 1 ||
    !Number.isSafeInteger(session.options.cycles) ||
    session.options.cycles < 1
  ) {
    issues.push('Invalid independent run or cycle count.');
  }

  if (session.options.software) {
    issues.push('Software-rendered diagnostic acquisition.');
  }

  if (session.runs.some(run => run.schemaVersion !== 1 || run.protocolHash !== session.protocolHash || !known(run.runId))) {
    issues.push('Run schema, protocol or identity does not match the session.');
  }

  if (session.runs.some(run => run.error !== null || run.outcome === null)) {
    issues.push('An independent run failed or has no outcome.');
  }

  if (!same(session.runs.map(run => canonical(run.source)))) {
    issues.push('Source revision, tree, dirty state or dependency locks differ between independent runs.');
  }

  if (!same(session.runs.map(run => canonical(run.host)))) {
    issues.push('Host declarations differ between independent runs.');
  }

  if (
    session.runs.some(
      run =>
        run.source.dirty ||
        !/^[\da-f]{40,64}$/i.test(run.source.commit) ||
        !/^[\da-f]{40,64}$/i.test(run.source.tree) ||
        [run.source.trackedDiffSha256, run.source.workspaceLockSha256, run.source.competitorLockSha256].some(
          hash => !/^[\da-f]{64}$/i.test(hash),
        ),
    )
  ) {
    issues.push('Source inputs are dirty or incompletely identified.');
  }

  if (
    session.runs.some(run =>
      [run.host.os, run.host.cpu, run.host.nodeVersion, run.host.machine, run.host.driver, run.host.power, run.host.background].some(
        value => !known(value),
      ),
    )
  ) {
    issues.push('Host, driver, power or background evidence is undeclared.');
  }

  const planned = session.plannedCells.map(spec => `${keyOf(spec)}:${cycleOf(spec)}`);

  if (new Set(planned).size !== planned.length) {
    issues.push('Duplicate planned cell/cycle.');
  }

  const planSet = new Set(planned);

  if (session.runs.some(run => run.outcome?.results.some(result => !planSet.has(`${keyOf(result.spec)}:${cycleOf(result.spec)}`)))) {
    issues.push('A run contains an unexpected cell/cycle outside the plan.');
  }

  return unique(issues);
};

const safeSummary = (values: readonly number[] | null | undefined, name: string, reasons: string[]): SampleSummary | null => {
  if (values === null || values === undefined) {
    return null;
  }

  try {
    return summarizeSamples(values);
  } catch {
    reasons.push(`Invalid ${name} samples.`);

    return null;
  }
};

const perFrame = <T extends object>(value: T | null, frames: number): T | null =>
  value === null || frames <= 0
    ? null
    : (Object.fromEntries(Object.entries(value).map(([key, count]) => [key, Number(count) / frames])) as T);

const rendererReason = (result: ObservedCell): string | null => {
  const renderer = result.renderer;

  if (renderer === undefined || renderer.adapter === null || renderer.backend === null) {
    return 'Actual per-cell renderer identity is missing.';
  }

  if (renderer.backend !== result.spec.backend) {
    return 'Actual renderer backend differs from the planned backend.';
  }

  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(renderer.adapter)) {
    return 'Actual renderer is software.';
  }

  if (
    !known(renderer.adapter) ||
    /masked|unverified|unavailable|unknown/i.test(renderer.adapter) ||
    !/\d/.test(renderer.adapter) ||
    !/\b(?:nvidia|geforce|radeon|intel|apple|adreno|mali|powervr|immortalis)\b/i.test(renderer.adapter)
  ) {
    return 'Actual renderer device identity is masked or incomplete.';
  }

  return null;
};

const provenanceIdentity = (stamp: Provenance): object => ({
  backend: stamp.backend,
  browser: stamp.browser,
  browserVersion: stamp.browserVersion,
  os: stamp.os,
  platformVersion: stamp.platformVersion,
  prerelease: stamp.prerelease,
  flags: stamp.flags,
  headless: stamp.headless,
  software: stamp.software,
  adapterUnverified: stamp.adapterUnverified ?? false,
  engineVersion: stamp.engineVersion,
  slotTier: stamp.slotTier ?? null,
});

const inspectObservation = (
  run: CompetitiveRun,
  result: ObservedCell,
  expected: CellSpec,
  session: CompetitiveSession,
): CompetitiveObservation => {
  const reasons: string[] = [];
  const telemetry = result.telemetry as ObservedTelemetry | undefined;
  const cpu = safeSummary(telemetry?.cpuMs, 'CPU', reasons);
  const raf = safeSummary(telemetry?.rafMs, 'rAF cadence', reasons);
  const update = safeSummary(telemetry?.updateMs, 'update', reasons);
  const submission = safeSummary(telemetry?.submissionMs, 'submission', reasons);
  const queue = safeSummary(telemetry?.gpu.queueMs, 'queue completion', reasons);
  const frameSource = SOURCES.includes(result.frameTimeSource ?? 'unavailable') ? (result.frameTimeSource ?? 'unavailable') : 'unavailable';
  const hardware = frameSource === 'webgl2-time-elapsed' || frameSource === 'webgpu-render-pass-timestamps';
  const gpu = hardware ? safeSummary(telemetry?.gpu.frameMs, 'GPU', reasons) : null;
  const frame = frameSource === 'raf-cadence' ? raf : gpu;
  const stamps = run.outcome?.provenance.filter(stamp => stamp.backend === result.spec.backend) ?? [];
  const stamp = stamps.length === 1 ? stamps[0]! : null;
  const resolution = result.clock?.resolutionMs ?? null;

  if (result.status !== 'ok') {
    reasons.push(`Cell status is ${result.status}.`);
  }

  if (
    result.spec.timedFrames !== expected.timedFrames ||
    result.spec.warmupFrames !== expected.warmupFrames ||
    result.spec.measurement?.profile !== expected.measurement?.profile
  ) {
    reasons.push('Cell sampling or instrumentation differs from the plan.');
  }

  if (telemetry === undefined || telemetry.schemaVersion !== 1) {
    reasons.push('Raw telemetry is missing or unsupported.');
  }

  if (cpu === null || cpu.count !== result.spec.timedFrames) {
    reasons.push('CPU samples do not cover every requested timed frame.');
  }

  if (resolution === null || !Number.isFinite(resolution) || resolution <= 0 || cpu === null || cpu.median <= 20 * resolution) {
    reasons.push('CPU median is not strictly above 20 observed clock ticks.');
  }

  const rendererIssue = rendererReason(result);

  if (rendererIssue !== null) {
    reasons.push(rendererIssue);
  }

  if (stamp === null) {
    reasons.push('Backend provenance is missing or duplicated.');
  }

  if (stamp?.software || stamp?.adapterUnverified) {
    reasons.push('Backend provenance does not establish hardware rendering.');
  }

  if (stamp !== null && [stamp.browserVersion, stamp.engineVersion, stamp.os].some(value => !known(value))) {
    reasons.push('Browser or engine version provenance is incomplete.');
  }

  const libraries =
    run.outcome?.libraries
      .map(library => ({ name: library.name, version: library.version }))
      .sort((a, b) => a.name.localeCompare(b.name)) ?? [];
  const libraryName = ({ pixi: 'pixi.js', phaser: 'phaser', excalibur: 'excalibur' } as Record<string, string>)[result.spec.engine];

  if (libraryName !== undefined && !libraries.some(library => library.name === libraryName && known(library.version))) {
    reasons.push('The measured competitor version is missing.');
  }

  if (telemetry !== undefined) {
    if (telemetry.profile !== session.options.profile || telemetry.profile !== result.spec.measurement?.profile) {
      reasons.push('Telemetry instrumentation profile differs from the declared profile.');
    }

    if (result.frameTimeSource === undefined || frameSource !== telemetry.frameTimeSource) {
      reasons.push('Frame metric source is missing or inconsistent.');
    }

    if (
      telemetry.warmup.requestedFrames !== result.spec.warmupFrames ||
      telemetry.warmup.completedFrames !== result.spec.warmupFrames ||
      !Number.isFinite(telemetry.warmup.elapsedMs) ||
      telemetry.warmup.elapsedMs < 0
    ) {
      reasons.push('Warmup evidence is incomplete.');
    }

    if (
      !telemetry.mutation.verified ||
      !known(telemetry.mutation.signature) ||
      !Number.isSafeInteger(telemetry.mutation.selectedCount) ||
      telemetry.mutation.selectedCount < 0 ||
      telemetry.mutation.selectedCount > result.spec.nodeCount ||
      !Number.isFinite(telemetry.mutation.nominalFraction) ||
      telemetry.mutation.nominalFraction < 0 ||
      telemetry.mutation.nominalFraction > 1
    ) {
      reasons.push('Canonical mutation evidence is incomplete.');
    }

    if (Object.values(telemetry.viewport).some(value => !Number.isFinite(value) || value <= 0)) {
      reasons.push('Viewport evidence is invalid.');
    }

    if (
      telemetry.profile === 'deep' &&
      (update?.count !== cpu?.count || submission?.count !== cpu?.count || update === null || submission === null)
    ) {
      reasons.push('Deep CPU splits do not cover the timed window.');
    }

    if (telemetry.profile !== 'deep' && (telemetry.updateMs !== null || telemetry.submissionMs !== null || telemetry.api !== null)) {
      reasons.push('Unexpected diagnostic instrumentation in a timing profile.');
    }

    if (telemetry.api !== null && Object.values(telemetry.api).some(value => !Number.isFinite(value) || value < 0)) {
      reasons.push('Invalid API counter totals.');
    }

    if (hardware) {
      const coverage = telemetry.gpu.timing;
      const requiredSource = result.spec.backend === 'webgl2' ? 'webgl2-time-elapsed' : 'webgpu-render-pass-timestamps';

      if (
        frameSource !== requiredSource ||
        coverage?.source !== frameSource ||
        coverage.status !== 'complete' ||
        coverage.attemptedFrames !== cpu?.count ||
        coverage.validFrames !== cpu?.count ||
        gpu?.count !== cpu?.count ||
        coverage.invalidFrames !== 0 ||
        coverage.unresolvedFrames !== 0 ||
        coverage.skippedFrames !== 0
      ) {
        reasons.push('Hardware GPU coverage is incomplete or has a different scope.');
      }
    }
  }

  const identity =
    telemetry === undefined || stamp === null
      ? null
      : canonical({
          protocol: run.protocolHash,
          source: run.source,
          host: run.host,
          provenance: provenanceIdentity(stamp),
          libraries,
          renderer: result.renderer ?? null,
          frameSource,
          profile: telemetry.profile,
          viewport: telemetry.viewport,
          mutation: telemetry.mutation,
          timedFrames: result.spec.timedFrames,
          warmupFrames: result.spec.warmupFrames,
          isolated: result.clock?.crossOriginIsolated ?? null,
          splits: telemetry.updateMs !== null,
          api: telemetry.api !== null,
        });
  const structuralTotals = telemetry?.structuralTotals ?? null;

  return {
    runIndex: run.runIndex,
    runId: run.runId,
    cycle: cycleOf(result.spec),
    status: result.status,
    note: result.note ?? null,
    reasons: unique(reasons),
    identity,
    cpu,
    update,
    submission,
    frame,
    gpu,
    raf,
    queue,
    frameSource,
    gpuCoverage: telemetry?.gpu.timing ?? null,
    api: telemetry?.api ?? null,
    apiPerFrame: perFrame(telemetry?.api ?? null, cpu?.count ?? 0),
    structuralTotals,
    structuralPerFrame: perFrame(structuralTotals, cpu?.count ?? 0),
    heap: telemetry?.heap ?? [],
    warmup: telemetry?.warmup ?? null,
    mutation: telemetry?.mutation ?? null,
    clockResolutionMs: result.clock?.resolutionMs ?? null,
  };
};

const missingObservation = (run: CompetitiveRun, cycle: number): CompetitiveObservation => ({
  runIndex: run.runIndex,
  runId: run.runId,
  cycle,
  status: 'missing',
  note: 'No result returned for the planned cell/cycle.',
  reasons: ['No result returned for the planned cell/cycle.'],
  identity: null,
  cpu: null,
  update: null,
  submission: null,
  frame: null,
  gpu: null,
  raf: null,
  queue: null,
  frameSource: 'unavailable',
  gpuCoverage: null,
  api: null,
  apiPerFrame: null,
  structuralTotals: null,
  structuralPerFrame: null,
  heap: [],
  warmup: null,
  mutation: null,
  clockResolutionMs: null,
});

const summarizeCell = (session: CompetitiveSession, spec: CellSpec, issues: readonly string[]): CompetitiveCellSummary => {
  const key = keyOf(spec);
  const reasons = [...issues];
  const observations: CompetitiveObservation[] = [];
  const runMedians: Array<{ runIndex: number; cpuMs: number }> = [];

  for (const run of session.runs) {
    const matches = run.outcome?.results.filter(result => keyOf(result.spec) === key) ?? [];
    const cycles = matches.map(result => cycleOf(result.spec));
    const complete =
      matches.length === session.options.cycles &&
      new Set(cycles).size === cycles.length &&
      cycles.every(cycle => Number.isSafeInteger(cycle) && cycle >= 0 && cycle < session.options.cycles);

    if (!complete) {
      reasons.push(`Run ${run.runIndex} has missing, duplicate or unexpected cycles.`);
    }

    const measured = matches.map(result => inspectObservation(run, result, spec, session));

    for (let cycle = 0; cycle < session.options.cycles; cycle++) {
      if (!cycles.includes(cycle)) {
        measured.push(missingObservation(run, cycle));
      }
    }

    measured.sort((a, b) => a.cycle - b.cycle);
    observations.push(...measured);
    reasons.push(...measured.flatMap(observation => observation.reasons));
    const medians = measured
      .filter(observation => observation.status === 'ok' && observation.cpu !== null)
      .map(observation => observation.cpu!.median);

    if (complete && medians.length === session.options.cycles) {
      runMedians.push({ runIndex: run.runIndex, cpuMs: summarizeSamples(medians)!.median });
    }
  }

  const identities = observations.map(observation => observation.identity ?? 'missing');

  if (!same(identities)) {
    reasons.push('Protocol, source, host, versions, flags, renderer, workload or instrumentation differs between observations.');
  }

  if (runMedians.length !== session.options.runs) {
    reasons.push('Missing complete independent run medians.');
  }

  const deduplicated = unique(reasons);

  return {
    key,
    spec,
    qualification: qualification(deduplicated),
    reasons: deduplicated,
    observations,
    runMedians: runMedians.sort((a, b) => a.runIndex - b.runIndex),
    medianCpuMs: summarizeSamples(runMedians.map(run => run.cpuMs))?.median ?? null,
    identity: same(identities) ? (observations[0]?.identity ?? null) : null,
  };
};

const compareCells = (
  reference: CompetitiveCellSummary,
  competitor: CompetitiveCellSummary,
  extra: readonly string[] = [],
  identityMatches = reference.identity !== null && reference.identity === competitor.identity,
): CompetitiveComparison => {
  const reasons = [...reference.reasons, ...competitor.reasons, ...extra];

  if (!identityMatches) {
    reasons.push('Comparison evidence identities differ.');
  }

  if (canonical(reference.runMedians.map(run => run.runIndex)) !== canonical(competitor.runMedians.map(run => run.runIndex))) {
    reasons.push('Independent run indices are not paired.');
  }

  const deduplicated = unique(reasons);

  return {
    reference: { key: reference.key, spec: reference.spec },
    competitor: { key: competitor.key, spec: competitor.spec },
    qualification: qualification(deduplicated),
    reasons: deduplicated,
    exploratory:
      deduplicated.length === 0
        ? compareRunMedians(
            reference.runMedians.map(run => run.cpuMs),
            competitor.runMedians.map(run => run.cpuMs),
          )
        : null,
    rankClaim: null,
  };
};

const dirtyRate = (archetype: string): number | null => {
  const match = /^dirty-(0|1|10|25|50|75|100)$/.exec(archetype);

  return match === null ? null : Number(match[1]);
};

const dirtySeries = (cells: readonly CompetitiveCellSummary[]): DirtyRateSeries[] => {
  const groups = new Map<string, CompetitiveCellSummary[]>();

  for (const cell of cells) {
    if (dirtyRate(cell.spec.archetype) === null) {
      continue;
    }

    const key = canonical([cell.spec.engine, cell.spec.config, cell.spec.backend, cell.spec.nodeCount]);
    groups.set(key, [...(groups.get(key) ?? []), cell]);
  }

  return [...groups.values()].map(group => ({
    engine: group[0]!.spec.engine,
    config: group[0]!.spec.config,
    backend: group[0]!.spec.backend,
    nodeCount: group[0]!.spec.nodeCount,
    points: DIRTY_RATES.map(rate => {
      const cell = group.find(candidate => dirtyRate(candidate.spec.archetype) === rate);

      return {
        rate,
        cpuMs: cell?.medianCpuMs ?? null,
        qualification: cell?.qualification ?? 'UNQUALIFIED',
        runs: cell?.runMedians.length ?? 0,
      };
    }),
  }));
};

const breakEvenBrackets = (comparisons: readonly CompetitiveComparison[]): CompetitiveAnalysis['breakEvenBrackets'] => {
  const brackets: Array<CompetitiveAnalysis['breakEvenBrackets'][number]> = [];

  for (const left of comparisons) {
    const rate = dirtyRate(left.reference.spec.archetype);
    const index = rate === null ? -1 : (DIRTY_RATES as readonly number[]).indexOf(rate);

    if (index === -1 || index === DIRTY_RATES.length - 1 || left.exploratory === null) {
      continue;
    }

    const right = comparisons.find(
      candidate =>
        candidate.reference.spec.engine === left.reference.spec.engine &&
        candidate.reference.spec.config === left.reference.spec.config &&
        candidate.competitor.spec.engine === left.competitor.spec.engine &&
        candidate.competitor.spec.config === left.competitor.spec.config &&
        candidate.reference.spec.backend === left.reference.spec.backend &&
        candidate.reference.spec.nodeCount === left.reference.spec.nodeCount &&
        dirtyRate(candidate.reference.spec.archetype) === DIRTY_RATES[index + 1],
    );
    const directions = [left.exploratory.status, right?.exploratory?.status];

    if (!directions.includes('REFERENCE_FASTER') || !directions.includes('COMPETITOR_FASTER')) {
      continue;
    }

    brackets.push({
      reference: `${left.reference.spec.engine}/${left.reference.spec.config}`,
      competitor: `${left.competitor.spec.engine}/${left.competitor.spec.config}`,
      backend: left.reference.spec.backend,
      nodeCount: left.reference.spec.nodeCount,
      rates: [rate!, DIRTY_RATES[index + 1]!],
    });
  }

  return brackets;
};

/** Describes each measured cell separately; repeated cycles contribute one median per independent invocation. */
export const analyzeCompetitiveSession = (session: CompetitiveSession): CompetitiveAnalysis => {
  const issues = inspectSession(session);
  const planned = new Map<string, CellSpec>();

  for (const spec of session.plannedCells) {
    planned.set(keyOf(spec), spec);
  }

  const cells = [...planned.values()].map(spec => summarizeCell(session, spec, issues));
  const comparisons = cells
    .filter(cell => cell.spec.engine === 'exojs')
    .flatMap(reference =>
      cells
        .filter(
          competitor =>
            competitor.spec.engine !== 'exojs' &&
            competitor.spec.backend === reference.spec.backend &&
            competitor.spec.archetype === reference.spec.archetype &&
            competitor.spec.nodeCount === reference.spec.nodeCount,
        )
        .map(competitor => compareCells(reference, competitor)),
    );

  return {
    schemaVersion: 1,
    status: 'DIAGNOSTIC_ONLY',
    protocolHash: session.protocolHash,
    createdAt: session.createdAt,
    issues,
    cells,
    comparisons,
    dirtyRates: dirtySeries(cells),
    breakEvenBrackets: breakEvenBrackets(comparisons),
  };
};

const revisionIdentity = (identity: string | null): string | null => {
  if (identity === null) {
    return null;
  }

  const value = JSON.parse(identity) as { source: CompetitiveRun['source'] };
  const { commit: _commit, tree: _tree, ...stable } = value.source;

  return canonical({ ...value, source: stable });
};

/** Exploratory current/baseline ratios for matching clean acquisitions; this never implements an automatic performance gate. */
export const compareCompetitiveSessions = (baseline: CompetitiveSession, current: CompetitiveSession) => {
  const before = analyzeCompetitiveSession(baseline);
  const after = analyzeCompetitiveSession(current);
  const issues = unique([
    ...before.issues,
    ...after.issues,
    ...(baseline.protocolHash !== current.protocolHash ? ['Session protocols differ.'] : []),
  ]);
  const cells = before.cells.map(reference => {
    const competitor = after.cells.find(cell => cell.key === reference.key);

    if (competitor === undefined) {
      return {
        key: reference.key,
        qualification: 'UNQUALIFIED' as Qualification,
        reasons: ['Current session is missing this cell.'],
        exploratory: null,
        rankClaim: null,
      };
    }

    const identity = revisionIdentity(reference.identity);

    return {
      key: reference.key,
      ...compareCells(reference, competitor, issues, identity !== null && identity === revisionIdentity(competitor.identity)),
    };
  });

  for (const cell of after.cells) {
    if (!before.cells.some(candidate => candidate.key === cell.key)) {
      cells.push({
        key: cell.key,
        qualification: 'UNQUALIFIED',
        reasons: ['Baseline session is missing this cell.'],
        exploratory: null,
        rankClaim: null,
      });
    }
  }

  return {
    schemaVersion: 1 as const,
    status: 'DIAGNOSTIC_ONLY' as const,
    automaticGate: false,
    ratioMeaning: 'current / baseline',
    issues,
    cells,
  };
};

const format = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? 'n/a' : value.toFixed(4);
const escapeHtml = (value: unknown): string =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const cellLabel = (spec: CellSpec): string => `${spec.engine}/${spec.config} | ${spec.backend} | ${spec.archetype} | ${spec.nodeCount}`;
const METRICS = ['cpu', 'frame', 'gpu', 'raf', 'update', 'submission', 'queue'] as const;
const STATISTICS = ['count', 'mean', 'median', 'p95', 'p99', 'min', 'max', 'variance', 'stutters', 'stutterThresholdMs'] as const;

const renderCsv = (analysis: CompetitiveAnalysis): string => {
  const header = [
    'engine',
    'config',
    'backend',
    'archetype',
    'nodeCount',
    'runIndex',
    'runId',
    'cycle',
    'status',
    'qualification',
    'frameSource',
    ...METRICS.flatMap(metric => STATISTICS.map(statistic => `${metric}_${statistic}`)),
    'apiTotals',
    'apiMeanPerFrame',
    'structuralTotals',
    'structuralMeanPerFrame',
    'heapSamples',
    'warmup',
    'mutation',
    'gpuCoverage',
    'reasons',
    'note',
  ];
  const rows = analysis.cells.flatMap(cell =>
    cell.observations.map(observation =>
      [
        cell.spec.engine,
        cell.spec.config,
        cell.spec.backend,
        cell.spec.archetype,
        cell.spec.nodeCount,
        observation.runIndex,
        observation.runId,
        observation.cycle,
        observation.status,
        cell.qualification,
        observation.frameSource,
        ...METRICS.flatMap(metric => STATISTICS.map(statistic => observation[metric]?.[statistic] ?? '')),
        JSON.stringify(observation.api),
        JSON.stringify(observation.apiPerFrame),
        JSON.stringify(observation.structuralTotals),
        JSON.stringify(observation.structuralPerFrame),
        JSON.stringify(observation.heap),
        JSON.stringify(observation.warmup),
        JSON.stringify(observation.mutation),
        JSON.stringify(observation.gpuCoverage),
        cell.reasons.join(' '),
        observation.note ?? '',
      ]
        .map(value => csvField(String(value)))
        .join(','),
    ),
  );

  return `${header.join(',')}\n${rows.join('\n')}\n`;
};

const renderMarkdown = (analysis: CompetitiveAnalysis): string => {
  const lines = [
    '# Competitive rendering diagnostics',
    '',
    `Status: **${analysis.status}**. No visual equivalence acceptance or publication qualification is recorded. No overall ranking is produced.`,
    '',
    `Protocol: \`${markdownCell(analysis.protocolHash)}\`. Created: ${markdownCell(analysis.createdAt)}.`,
    '',
    'Each row is one cell in one run/cycle. Percentiles, variance and stutters describe that timed window; a p99 from a short window is a coarse order statistic. A stutter is a sample above 33.3333 ms, not an application-wide FPS verdict. CPU splits are instrumented deep-profile observations. Queue completion and rAF cadence are not GPU execution time.',
    '',
    'A cell summary uses the median of its independent run medians. Repeated cycles within one invocation are summarized within that run and never increase the independent sample count. All numerical ratios remain exploratory; unqualified cells receive no comparative ratio.',
    '',
  ];

  if (analysis.issues.length > 0) {
    lines.push('## Acquisition limitations', '', ...analysis.issues.map(issue => `- ${markdownCell(issue)}`), '');
  }

  lines.push(
    '## Per-acquisition measurements',
    '',
    '| Cell | Run / cycle | Qualification | CPU median / p95 / p99 / max (ms) | CPU variance (ms^2) / stutters | Update / submission median (ms) | Frame source; median / p95 / p99 / max (ms) | GPU median (ms) | rAF median (ms) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const cell of analysis.cells) {
    for (const observation of cell.observations) {
      lines.push(
        `| ${markdownCell(cellLabel(cell.spec))} | ${observation.runIndex} / ${observation.cycle} | ${cell.qualification} | ${[observation.cpu?.median, observation.cpu?.p95, observation.cpu?.p99, observation.cpu?.max].map(format).join(' / ')} | ${format(observation.cpu?.variance)} / ${observation.cpu?.stutters ?? 'n/a'} | ${format(observation.update?.median)} / ${format(observation.submission?.median)} | ${observation.frameSource}; ${[observation.frame?.median, observation.frame?.p95, observation.frame?.p99, observation.frame?.max].map(format).join(' / ')} | ${format(observation.gpu?.median)} | ${format(observation.raf?.median)} |`,
      );
    }

    if (cell.observations.length === 0) {
      lines.push(
        `| ${markdownCell(cellLabel(cell.spec))} | n/a | UNQUALIFIED: no observations | n/a | n/a | n/a | unavailable | n/a | n/a |`,
      );
    }
  }

  lines.push(
    '',
    '## Exploratory paired-run comparisons',
    '',
    '| Reference | Competitor | Independent runs | Competitor / reference | Bootstrap interval | Qualification |',
    '| --- | --- | --- | --- | --- | --- |',
  );

  for (const comparison of analysis.comparisons) {
    lines.push(
      `| ${markdownCell(cellLabel(comparison.reference.spec))} | ${markdownCell(cellLabel(comparison.competitor.spec))} | ${comparison.exploratory?.runs ?? 'n/a'} | ${format(comparison.exploratory?.ratio)} | ${comparison.exploratory?.interval95?.map(format).join(' - ') ?? 'n/a'} | ${comparison.qualification} |`,
    );
  }

  lines.push(
    '',
    '## Evidence and limitations',
    '',
    'API totals cover the observed timed window; means divide by the actual CPU frame count. WebGL texture binds are bindTexture calls, while WebGPU texture-bind counters observe setBindGroup calls. These are different API operations. Null counters are unavailable, not zero. Heap observations are optional JavaScript heap estimates, not VRAM or proof of a leak. Full counter, coverage and heap observations are preserved in the summary JSON and CSV.',
    '',
  );

  for (const cell of analysis.cells) {
    if (cell.reasons.length > 0) {
      lines.push(`- ${markdownCell(cellLabel(cell.spec))}: ${cell.reasons.map(markdownCell).join(' ')}`);
    }
  }

  lines.push(
    '',
    '## Dirty-rate reversal brackets',
    '',
    'Only adjacent supported measured nominal rates with qualified, statistically directional comparisons can define a bracket. A bracket is not an interpolated break-even estimate; no extrapolation is performed. Mutation-selected counts are preserved with each observation.',
    '',
  );

  if (analysis.breakEvenBrackets.length === 0) {
    lines.push('No qualified measured reversal bracket is established.');
  }

  for (const bracket of analysis.breakEvenBrackets) {
    lines.push(
      `- ${markdownCell(bracket.reference)} versus ${markdownCell(bracket.competitor)}, ${bracket.backend}, load ${bracket.nodeCount}: ${bracket.rates[0]}% to ${bracket.rates[1]}% nominal dirty.`,
    );
  }

  return `${lines.join('\n')}\n`;
};

const renderCharts = (series: readonly DirtyRateSeries[]): string => {
  const groups = new Map<string, DirtyRateSeries[]>();

  for (const curve of series) {
    const key = `${curve.backend}:${curve.nodeCount}`;
    groups.set(key, [...(groups.get(key) ?? []), curve]);
  }

  const colors = ['#1d4ed8', '#0f766e', '#be123c', '#7c3aed', '#b45309', '#334155'];

  return [...groups.values()]
    .map(curves => {
      const top = Math.max(1, ...curves.flatMap(curve => curve.points.map(point => point.cpuMs ?? 0))) * 1.1;
      const x = (rate: number): number => 70 + rate * 6.6;
      const y = (value: number): number => 245 - (value / top) * 210;
      const lines = curves
        .map((curve, index) => {
          const color = colors[index % colors.length]!;
          const segments = curve.points.flatMap((point, position) => {
            const previous = curve.points[position - 1];

            if (point.cpuMs === null || previous?.cpuMs === null || previous === undefined) {
              return [];
            }

            const dashed =
              point.qualification === 'UNQUALIFIED' || previous.qualification === 'UNQUALIFIED' ? ' stroke-dasharray="5 5"' : '';

            return [
              `<line x1="${x(previous.rate)}" y1="${y(previous.cpuMs)}" x2="${x(point.rate)}" y2="${y(point.cpuMs)}" stroke="${color}" stroke-width="2"${dashed}/>`,
            ];
          });
          const points = curve.points
            .filter(point => point.cpuMs !== null)
            .map(
              point =>
                `<circle data-rate="${point.rate}" cx="${x(point.rate)}" cy="${y(point.cpuMs!)}" r="4" fill="${color}"><title>${escapeHtml(`${curve.engine}/${curve.config}: ${point.rate}% nominal dirty, ${format(point.cpuMs)} ms; ${point.qualification}, ${point.runs} independent runs`)}</title></circle>`,
            );

          return [...segments, ...points].join('');
        })
        .join('');
      const ticks = DIRTY_RATES.map(
        (rate, index) => `<text x="${x(rate)}" y="${index === 1 ? 278 : 264}" text-anchor="middle">${rate}</text>`,
      ).join('');
      const legend = curves
        .map(
          (curve, index) => `<span style="color:${colors[index % colors.length]}">${escapeHtml(`${curve.engine}/${curve.config}`)}</span>`,
        )
        .join(' ');

      return `<section class="chart"><h3>${escapeHtml(`${curves[0]!.backend} | load ${curves[0]!.nodeCount}`)}</h3><div class="legend">${legend}</div><svg viewBox="0 0 780 310" role="img" aria-label="Measured CPU median against nominal dirty percentage"><path d="M70 35V245H730" fill="none" stroke="#64748b"/><text x="10" y="28">CPU ms</text><text x="60" y="45" text-anchor="end">${format(top)}</text><text x="60" y="249" text-anchor="end">0</text>${ticks}${lines}<text x="390" y="302" text-anchor="middle">Nominal dirty percentage (numeric spacing)</text></svg></section>`;
    })
    .join('');
};

const renderHtml = (analysis: CompetitiveAnalysis, session: CompetitiveSession): string => {
  const rows = analysis.cells
    .flatMap(cell =>
      cell.observations.map(
        observation =>
          `<tr><td>${escapeHtml(cellLabel(cell.spec))}<br/><small>run ${observation.runIndex}, cycle ${observation.cycle}; ${escapeHtml(observation.status)}</small></td><td>${escapeHtml(cell.qualification)}</td><td>${[observation.cpu?.median, observation.cpu?.p95, observation.cpu?.p99, observation.cpu?.max].map(format).join(' / ')}<br/><small>variance ${format(observation.cpu?.variance)} ms^2; ${observation.cpu?.stutters ?? 'n/a'} stutters</small></td><td>${format(observation.update?.median)} / ${format(observation.submission?.median)}</td><td>${format(observation.gpu?.median)}<br/><small>${escapeHtml(observation.frameSource)}</small></td><td>${format(observation.raf?.median)} / ${format(observation.raf?.p95)}</td><td><details><summary>Samples, counters and limitations</summary><p>${escapeHtml(cell.reasons.join(' '))}</p><p>${escapeHtml(observation.note ?? '')}</p><pre>${escapeHtml(JSON.stringify(observation, null, 2))}</pre></details></td></tr>`,
      ),
    )
    .join('');
  const comparisons = analysis.comparisons
    .map(
      comparison =>
        `<tr><td>${escapeHtml(cellLabel(comparison.reference.spec))}</td><td>${escapeHtml(`${comparison.competitor.spec.engine}/${comparison.competitor.spec.config}`)}</td><td>${comparison.exploratory?.runs ?? 'n/a'}</td><td>${format(comparison.exploratory?.ratio)}</td><td>${comparison.exploratory?.interval95?.map(format).join(' - ') ?? 'n/a'}</td><td>${escapeHtml(comparison.qualification)}<details><summary>Evidence</summary>${escapeHtml(comparison.reasons.join(' ') || `Two-sided sign-test p=${format(comparison.exploratory?.signTestP)}. Exploratory only; no publication or ranking claim.`)}</details></td></tr>`,
    )
    .join('');
  const provenance = session.runs.map(run => ({
    runIndex: run.runIndex,
    runId: run.runId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    source: run.source,
    host: run.host,
    provenance: run.outcome?.provenance ?? null,
    libraries: run.outcome?.libraries ?? null,
    error: run.error,
  }));

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Competitive rendering diagnostics</title><style>body{margin:0;background:#f8fafc;color:#172033;font:15px/1.5 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px}h1{font-size:32px;margin:0 0 8px}h2{margin-top:36px}p{max-width:100ch}.status{display:inline-block;background:#fef3c7;padding:5px 10px;font-weight:700}.table{overflow:auto;background:white;border:1px solid #cbd5e1}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#e2e8f0;white-space:nowrap}small{color:#475569}details{min-width:160px}summary{cursor:pointer}pre{max-width:700px;max-height:450px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}svg{width:100%;max-height:350px;font-size:11px}.chart{background:white;border:1px solid #cbd5e1;padding:18px;margin:18px 0}.legend{display:flex;gap:20px;flex-wrap:wrap;font-weight:600}li{margin:6px 0}</style></head><body><main><span class="status">DIAGNOSTIC_ONLY</span><h1>Competitive rendering diagnostics</h1><p>No visual equivalence acceptance or publication qualification is recorded. These results establish no overall ranking. All observations, including software-rendered diagnostics, remain visible; unqualified data receives no comparative ratio.</p><p>Protocol: ${escapeHtml(analysis.protocolHash)}<br/>Created: ${escapeHtml(analysis.createdAt)}</p><ul>${analysis.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul><details><summary>Exact acquisition provenance</summary><pre>${escapeHtml(JSON.stringify(provenance, null, 2))}</pre></details><h2>Measured dirty-rate curves</h2><p>Only measured data is plotted. Missing rates remain gaps. The X axis uses numeric percentage spacing. Current and retained configurations are separate curves. Dashed segments are unqualified diagnostics. The Y value is the median of independent run medians; cycles within one invocation do not increase the independent sample count. Nominal rates can differ from realized selected counts, which remain in each observation.</p>${renderCharts(analysis.dirtyRates) || '<p>No dirty-rate measurements are available.</p>'}<h2>Measured reversal brackets</h2><p>These are intervals between adjacent qualified measured rates, never interpolated break-even values or extrapolations.</p><ul>${analysis.breakEvenBrackets.map(bracket => `<li>${escapeHtml(`${bracket.reference} versus ${bracket.competitor}; ${bracket.backend}, load ${bracket.nodeCount}: ${bracket.rates[0]}% to ${bracket.rates[1]}% nominal dirty`)}</li>`).join('') || '<li>No qualified measured reversal bracket is established.</li>'}</ul><h2>Per-acquisition distributions</h2><p>Each row is one run/cycle of one cell. CPU values are median / p95 / p99 / maximum in milliseconds. P99 from a short window is a coarse order statistic. Stutters count samples above 33.3333 ms. Deep-profile update/submission splits include their instrumentation. rAF cadence and queue-completion observations are not GPU execution time.</p><div class="table"><table><thead><tr><th>Cell and acquisition</th><th>Qualification</th><th>CPU distribution</th><th>Update / submission medians</th><th>GPU median and frame source</th><th>rAF median / p95</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div><h2>Exploratory paired-run ratios</h2><p>The ratio is competitor / reference using paired independent run medians. A bootstrap interval is exploratory, not publication acceptance. No heterogeneous cells are averaged.</p><div class="table"><table><thead><tr><th>Reference cell</th><th>Competitor</th><th>Independent runs</th><th>Ratio</th><th>Bootstrap interval</th><th>Qualification</th></tr></thead><tbody>${comparisons}</tbody></table></div><h2>Counter and memory scope</h2><p>Counter totals cover the observed timed window; means divide by the actual CPU frame count. WebGL texture binds count bindTexture, while WebGPU texture-bind counters count setBindGroup. These different API operations do not establish equivalent GPU work. Null counters mean unavailable, never zero. Heap samples are optional JavaScript heap estimates, not VRAM and not proof of a leak. GPU scope and coverage are retained per observation. No automatic CI performance gate is applied.</p></main></body></html>`;
};

/** Writes derived diagnostics; the caller owns persistence of the complete raw competitive session. */
export const writeCompetitiveReport = (session: CompetitiveSession, outDir: string): void => {
  const analysis = analyzeCompetitiveSession(session);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'competitive.summary.json'), `${JSON.stringify(analysis, null, 2)}\n`);
  writeFileSync(join(outDir, 'competitive.csv'), renderCsv(analysis));
  writeFileSync(join(outDir, 'competitive.md'), renderMarkdown(analysis));
  writeFileSync(join(outDir, 'competitive.html'), renderHtml(analysis, session));
};
