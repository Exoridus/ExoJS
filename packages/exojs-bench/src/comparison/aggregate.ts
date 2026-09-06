import type { PhysicsProvenance } from '../physics/driver';
import type { PhysicsReportData } from '../physics/report';
import { isIdentifyingPart, normalizeCpuModel, normalizeGpuAdapter, normalizeOsName, PRERELEASE_SEGMENT } from '../profile/slug';
import type { Provenance } from '../rendering/driver';
import type { ReportData } from '../rendering/report';
import { exceedsFrameBudget } from '../shared/frameBudget';
import type { LibraryProvenance, PlatformVersionStamp, PrereleaseStamp } from '../shared/provenance';
import { median } from '../shared/timing';
import type { BackendComparison, ComparisonCell, ComparisonRow, ComparisonSection, ExcludedRow } from './build';
import { buildPhysicsComparison, buildRenderingComparison } from './build';
import type { AggregatedBackendComparison, AggregatedCell, AggregatedRow, AggregatedSection, RunSpread } from './pooled';
import { compareMedians, NO_VERDICT, UNSTABLE_VERDICT, verdictRung } from './verdict';

/**
 * Pools several repetitions of one measurement into the comparison that gets
 * published.
 *
 * A published claim is a ratio between two arms, and a single run does not
 * support one: the same code measured twice on the same idle machine moves the
 * per-cell median far enough to change which arm a cell favours, while the
 * simulation behind it is byte-identical. A reference measurement is therefore
 * several runs, and this stage sits in front of {@link buildRenderingComparison}
 * and {@link buildPhysicsComparison}: each run is turned into its own comparison
 * model by the existing single-run code, and the models are then merged cell by
 * cell.
 *
 * The merge publishes per cell:
 *
 * - the **median of the per-run medians**, so one unlucky run cannot set the
 *   published number, and the median of the per-run p95s beside it;
 * - the **observed spread** of those per-run medians, so a reader sees how far
 *   the number moved between the quietest and the noisiest run;
 * - a **stability flag**, computed by placing every run on the verdict ladder
 *   independently. A cell whose runs disagree carries {@link UNSTABLE_VERDICT}
 *   and prints no verdict at all;
 * - the **frame-budget mark**, recomputed from the pooled median rather than
 *   inherited from any one run.
 *
 * The runs must come from SEPARATE harness invocations. Repeating a matrix
 * inside one process shares JIT and heap state across the repetitions and
 * measures the same warm state several times, which is the effect the
 * repetition exists to expose. Nothing here can check that, so it is a rule for
 * whoever runs the harness rather than a validation.
 */

/**
 * Thrown when the runs handed in do not repeat one measurement.
 *
 * Pooling two runs of different code, different library versions or different
 * matrices would produce a median over values that were never comparable, and
 * the resulting spread would describe the difference between the two runs
 * rather than the noise of one measurement.
 */
export class IncomparableRunsError extends Error {
  public readonly domain: string;

  public constructor(domain: string, message: string) {
    super(message);
    this.name = 'IncomparableRunsError';
    this.domain = domain;
  }
}

/** The rendering domain of a reference measurement. */
export interface AggregatedRendering {
  /** One entry per pooled run, in the order the runs were given: that run's stamps, one per backend it exercised. */
  readonly runs: ReadonlyArray<readonly Provenance[]>;
  /** Competitor library arms and their versions, identical across the runs by construction. */
  readonly libraries: readonly LibraryProvenance[];
  /** The pooled comparison, one block per backend. */
  readonly backends: readonly AggregatedBackendComparison[];
}

/** The physics domain of a reference measurement. */
export interface AggregatedPhysics {
  /** One stamp per pooled run, in the order the runs were given. */
  readonly runs: readonly PhysicsProvenance[];
  /** Physics engine arms and their versions, identical across the runs by construction. */
  readonly libraries: readonly LibraryProvenance[];
  /** The pooled comparison section. */
  readonly section: AggregatedSection;
}

/** How many examples of a difference an error message names before it stops listing. */
const EXAMPLE_LIMIT = 3;

const examples = (values: readonly string[]): string =>
  values.length <= EXAMPLE_LIMIT ? values.join(', ') : `${values.slice(0, EXAMPLE_LIMIT).join(', ')}, and ${String(values.length - EXAMPLE_LIMIT)} more`;

/**
 * Reject the first pair of runs that describe different measurements.
 *
 * Every run is compared against the first, so the message can name which run
 * broke the repetition and what it measured instead.
 */
const requireSameSet = (perRun: ReadonlyArray<readonly string[]>, what: string, domain: string): void => {
  const first = new Set(perRun[0] ?? []);

  for (const [index, values] of perRun.entries()) {
    if (index === 0) {
      continue;
    }

    const current = new Set(values);
    const dropped = [...first].filter(value => !current.has(value)).sort();
    const added = [...current].filter(value => !first.has(value)).sort();

    if (dropped.length === 0 && added.length === 0) {
      continue;
    }

    const differences = [
      ...(dropped.length > 0 ? [`run 1 has ${examples(dropped)}`] : []),
      ...(added.length > 0 ? [`run ${String(index + 1)} has ${examples(added)}`] : []),
    ];

    throw new IncomparableRunsError(
      domain,
      `${domain} run ${String(index + 1)} does not measure the same ${what} as run 1: ${differences.join('; ')}. Runs pooled into one profile must repeat one measurement, not compare two.`,
    );
  }
};

/**
 * Reject runs taken on different machines: their timings describe different
 * hardware.
 *
 * Pooling across machines is the one incomparability that produces a
 * plausible-looking result rather than an obvious one. Every other check here
 * guards the measurement's subject; this one guards its subject's identity, and
 * without it a fast machine's run and a slow machine's run merge into a median
 * belonging to neither, with a spread that reports the gap between two
 * computers as the noise of one.
 */
const requireSameMachine = (perRun: readonly string[], what: string, domain: string): void => {
  const first = perRun[0];

  for (const [index, identity] of perRun.entries()) {
    if (index === 0 || identity === first) {
      continue;
    }

    throw new IncomparableRunsError(
      domain,
      `${domain} run ${String(index + 1)} was measured on a different ${what} than run 1 (${String(first)} vs ${identity}). Runs pooled into one profile describe one machine; measure each machine into its own profile.`,
    );
  }
};

/**
 * The operating system a run belongs to, exactly as the slug's OS part spells
 * it: name, major version and, for a pre-release build, the `beta` marker.
 *
 * The major version is part of the identity because it is part of the file
 * name: a run on a beta platform and a run on the release it became would
 * otherwise pool into a number describing neither. A version nothing
 * established is kept distinct from every established one, so an undeclared run
 * cannot pool with a declared one and quietly borrow its version.
 */
const platformIdentity = (os: string, version: PlatformVersionStamp | undefined, prerelease: PrereleaseStamp | undefined): string =>
  [
    normalizeOsName(os),
    version === undefined || version.source === 'undetermined' ? 'unstated-version' : String(version.major),
    prerelease?.value === true ? PRERELEASE_SEGMENT : 'shipping',
  ].join('-');

/**
 * The machine and browser a rendering run belongs to.
 *
 * Built from exactly the parts that decide which published profile a run lands
 * in - the GPU the adapter string names, the operating system with its major
 * version, the browser engine - plus whether the platform was pre-release,
 * using the slug's own normalizations. Two runs may therefore pool precisely
 * when they would be written to one file, and a run that would land elsewhere
 * is rejected instead of quietly averaged into this one.
 *
 * Deliberately tolerated, because these move between runs on one machine: the
 * timestamp; the driver, API and device-id tail of an adapter string
 * (`Direct3D11 vs_5_0 ps_5_0`, `(0x00002C05)`), which a driver update rewrites
 * without the GPU changing; and the operating system's patch level. The browser
 * patch version is tolerated too - the checkout pins the browser build, so it
 * cannot drift within a repetition - and every stamp records all of it in full
 * for a reader to judge.
 *
 * The pre-release bit is part of the identity rather than a tolerance: a run on
 * a beta platform and a run on the shipping one describe different platforms,
 * and pooling them would publish a stable-looking number half of which was not.
 *
 * One limit is inherent and cannot be closed here. Where the browser reports a
 * constant instead of the GPU, the slug names the machine after the CPU model,
 * which only the physics provenance carries; a rendering run therefore
 * identifies its machine no more precisely than that constant does, and two
 * such machines running the same operating system and browser are
 * indistinguishable to this check.
 */
const renderingMachine = (stamps: readonly Provenance[]): string => {
  const gpu = stamps.map(stamp => normalizeGpuAdapter(stamp.adapter)).find(isIdentifyingPart) ?? 'unidentified-gpu';
  const first = stamps[0];

  return [gpu, platformIdentity(first?.os ?? '', first?.platformVersion, first?.prerelease), first?.browser ?? 'unknown-browser'].join(' / ');
};

/**
 * The measurement condition a physics run belongs to: no GPU is exercised, so
 * the CPU host names the machine - and the browser names the JavaScript engine
 * that executed the steps, which two runs must share before their medians can be
 * pooled into one.
 */
const physicsMachine = (stamp: PhysicsProvenance): string =>
  [normalizeCpuModel(stamp.host.cpu), platformIdentity(stamp.host.os, stamp.host.platformVersion, stamp.prerelease), stamp.host.arch, stamp.browser].join(
    ' / ',
  );

/** Reject runs measured against different trees: their timings describe different code. */
const requireSameEngineVersion = (perRun: ReadonlyArray<readonly string[]>, domain: string): void => {
  const versions = [...new Set(perRun.flat())].sort();

  if (versions.length > 1) {
    throw new IncomparableRunsError(
      domain,
      `${domain} runs were measured at different engine versions (${versions.join(', ')}). Re-measure every run on one tree; two runs of different code are not a repetition.`,
    );
  }
};

/** A domain that was asked for must have at least one run behind it. */
const requireRuns = <T>(runs: readonly T[], domain: string): void => {
  if (runs.length === 0) {
    throw new IncomparableRunsError(domain, `No ${domain} run was given.`);
  }
};

const spreadOf = (values: readonly number[]): RunSpread => {
  const minMs = Math.min(...values);
  const maxMs = Math.max(...values);

  return { minMs, maxMs, ratio: minMs > 0 ? maxMs / minMs : Number.NaN };
};

/** The spread of a value no run produced: an absence, never a zero. */
const NO_SPREAD: RunSpread = { minMs: Number.NaN, maxMs: Number.NaN, ratio: Number.NaN };

const measured = (value: number | null): value is number => value !== null && Number.isFinite(value);

/**
 * Pool one arm pair across the runs that produced it.
 *
 * A cell that some run did not produce is unstable by construction: that run
 * placed the pair on no rung at all, so the runs cannot be said to agree on
 * one. Beyond rung agreement the pooled medians are checked to land on the same
 * rung as well - pooling is monotone in each arm separately but not in their
 * ratio, so agreeing runs can in principle pool to a different outcome, and
 * publishing that outcome would state a verdict no run measured.
 */
const aggregateCell = (perRun: readonly ComparisonCell[], runCount: number): AggregatedCell => {
  const first = perRun[0]!;
  const references = perRun.map(cell => cell.referenceMs).filter(measured);
  const competitors = perRun.map(cell => cell.competitorMs).filter(measured);
  const referenceP95s = perRun.map(cell => cell.referenceP95Ms).filter(measured);
  const competitorP95s = perRun.map(cell => cell.competitorP95Ms).filter(measured);
  const rungs = perRun.map(cell => verdictRung(cell.verdict));
  const referenceMs = references.length > 0 ? median(references) : null;
  const competitorMs = competitors.length > 0 ? median(competitors) : null;
  const pooled = referenceMs === null || competitorMs === null ? NO_VERDICT : compareMedians(referenceMs, competitorMs);
  const stable = perRun.length === runCount && new Set(rungs).size === 1 && rungs[0] === verdictRung(pooled);

  return {
    competitor: first.competitor,
    referenceMs,
    // The p95 is pooled the way the median is - the median of the per-run p95s -
    // so one run's worst window cannot set it either. It is a tail statistic
    // pooled across runs, not a tail across the pooled samples, which no
    // published artifact retains.
    referenceP95Ms: referenceP95s.length > 0 ? median(referenceP95s) : null,
    // Recomputed from the POOLED median rather than carried over from a run: the
    // published number is the one the mark has to describe, and a run's own mark
    // can disagree with it near the line.
    referenceOverFrameBudget: exceedsFrameBudget(referenceMs),
    competitorMs,
    competitorP95Ms: competitorP95s.length > 0 ? median(competitorP95s) : null,
    competitorOverFrameBudget: exceedsFrameBudget(competitorMs),
    verdict: stable ? pooled : UNSTABLE_VERDICT,
    mechanism: first.mechanism,
    aggregate: {
      runs: perRun.length,
      reference: references.length > 0 ? spreadOf(references) : NO_SPREAD,
      competitor: competitors.length > 0 ? spreadOf(competitors) : NO_SPREAD,
      stable,
      rungs,
    },
  };
};

/** Group values by a key, keeping first-seen key order. */
const groupBy = <T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const id = key(value);
    const group = groups.get(id);

    if (group === undefined) {
      groups.set(id, [value]);
    } else {
      group.push(value);
    }
  }

  return groups;
};

/**
 * Pool one archetype's row across the runs that produced it.
 *
 * The runs have to agree on the row's count. Each run picks it from the
 * archetype's ladder and lowers it only when some arm failed to produce a valid
 * cell, so a disagreement means the runs measured different scenes - and pooling
 * their medians would publish a number belonging to neither at a size only some
 * of them used.
 */
const aggregateRow = (perRun: readonly ComparisonRow[], runCount: number, domain: string): AggregatedRow => {
  const first = perRun[0]!;
  const counts = [...new Set(perRun.map(row => row.count))];

  if (counts.length > 1) {
    throw new IncomparableRunsError(
      domain,
      `${domain} runs measured '${first.archetype}' at different counts (${counts.map(String).join(', ')}), so their medians describe different scenes. Re-measure: a row's count only moves when an arm failed to produce a valid cell.`,
    );
  }

  const cells = groupBy(
    perRun.flatMap(row => row.cells),
    cell => cell.competitor,
  );

  return { archetype: first.archetype, category: first.category, count: first.count, cells: [...cells.values()].map(group => aggregateCell(group, runCount)) };
};

const aggregateRows = (perRun: ReadonlyArray<readonly ComparisonRow[]>, runCount: number, domain: string): readonly AggregatedRow[] =>
  [...groupBy(perRun.flat(), row => row.archetype).values()].map(group => aggregateRow(group, runCount, domain));

const aggregateSection = (perRun: readonly ComparisonSection[], runCount: number, domain: string): AggregatedSection => ({
  title: perRun[0]!.title,
  rows: aggregateRows(
    perRun.map(section => section.rows),
    runCount,
    domain,
  ),
});

/** Omissions from every run, first reason kept: a row is excluded for the same cause in each. */
const mergeExcluded = (perRun: ReadonlyArray<readonly ExcludedRow[]>): readonly ExcludedRow[] =>
  [...groupBy(perRun.flat(), row => row.archetype).values()].map(group => group[0]!);

/**
 * Pool one backend's blocks.
 *
 * The headline count has to agree: it is chosen from the archetype ladders and
 * then lowered until every arm produced a valid cell, so runs landing on
 * different counts measured different rows and their medians are not
 * repetitions of one another.
 */
const aggregateBackend = (perRun: readonly BackendComparison[], runCount: number, domain: string): AggregatedBackendComparison => {
  const first = perRun[0]!;
  const counts = [...new Set(perRun.map(block => block.headlineCount))];

  if (counts.length > 1) {
    throw new IncomparableRunsError(
      domain,
      `${domain} runs chose different headline counts on ${first.backend} (${counts.map(String).join(', ')}), so their rows were measured at different sizes. Re-measure: a count only moves when an arm failed to produce a valid cell.`,
    );
  }

  const sections = [
    ...groupBy(
      perRun.flatMap(block => block.sections),
      section => section.title,
    ).values(),
  ].map(group => aggregateSection(group, runCount, domain));

  return {
    backend: first.backend,
    headlineCount: first.headlineCount,
    competitors: first.competitors,
    sections,
    excluded: mergeExcluded(perRun.map(block => block.excluded)),
    webgl1: aggregateRows(
      perRun.map(block => block.webgl1),
      runCount,
      domain,
    ),
  };
};

/** Identity of one measured rendering cell, independent of what it timed. */
const renderingCellKey = (spec: ReportData['results'][number]['spec']): string =>
  `${spec.engine}|${spec.config}|${spec.backend}|${spec.archetype}|${String(spec.nodeCount)}`;

/** Identity of one measured physics cell, independent of what it timed. */
const physicsCellKey = (spec: PhysicsReportData['results'][number]['spec']): string =>
  `${spec.engine}|${spec.config}|${spec.archetype}|${String(spec.bodyCount)}`;

const armKeys = (libraries: readonly LibraryProvenance[]): readonly string[] => libraries.map(library => `${library.name}@${library.version}`);

/**
 * Pool several rendering runs into the comparison a profile publishes.
 *
 * Throws {@link IncomparableRunsError} when the runs were measured on different
 * machines or browsers, at different engine versions, against different library
 * arms, or over different matrices.
 */
export const aggregateRenderingRuns = (runs: readonly ReportData[]): AggregatedRendering => {
  requireRuns(runs, 'rendering');
  requireSameMachine(
    runs.map(run => renderingMachine(run.provenance)),
    'machine or browser',
    'rendering',
  );
  requireSameEngineVersion(
    runs.map(run => run.provenance.map(stamp => stamp.engineVersion)),
    'rendering',
  );
  requireSameSet(
    runs.map(run => armKeys(run.libraries)),
    'library arms',
    'rendering',
  );
  requireSameSet(
    runs.map(run => run.results.map(result => renderingCellKey(result.spec))),
    'cells',
    'rendering',
  );

  const perRun = runs.map(run => buildRenderingComparison(run.results));
  const backends = [...groupBy(perRun.flat(), block => block.backend).values()].map(group => aggregateBackend(group, runs.length, 'rendering'));

  return { runs: runs.map(run => run.provenance), libraries: runs[0]!.libraries, backends };
};

/**
 * Pool several physics runs into the comparison a profile publishes.
 *
 * Throws {@link IncomparableRunsError} on the same grounds as
 * {@link aggregateRenderingRuns}.
 */
export const aggregatePhysicsRuns = (runs: readonly PhysicsReportData[]): AggregatedPhysics => {
  requireRuns(runs, 'physics');
  requireSameMachine(
    runs.map(run => physicsMachine(run.provenance)),
    'machine',
    'physics',
  );
  requireSameEngineVersion(
    runs.map(run => [run.provenance.engineVersion]),
    'physics',
  );
  requireSameSet(
    runs.map(run => armKeys(run.libraries)),
    'library arms',
    'physics',
  );
  requireSameSet(
    runs.map(run => run.results.map(result => physicsCellKey(result.spec))),
    'cells',
    'physics',
  );

  return {
    runs: runs.map(run => run.provenance),
    libraries: runs[0]!.libraries,
    section: aggregateSection(
      runs.map(run => buildPhysicsComparison(run.results)),
      runs.length,
      'physics',
    ),
  };
};
