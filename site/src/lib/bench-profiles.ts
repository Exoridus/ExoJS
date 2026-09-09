/**
 * Published benchmark profiles, as the benchmarks page reads them.
 *
 * Every number the page shows comes from a file under
 * `packages/exojs-bench/results/`, written by the benchmark harness and covered
 * by a signature gate. Nothing here computes a timing, a ratio or a verdict: the
 * module loads the documents, decides which one is the reference, and derives
 * only which rows are worth a headline sentence. The values inside that sentence
 * are still copied out of the file.
 *
 * A document pools several separate harness runs, so each cell also carries the
 * spread those runs observed and whether they agreed on the verdict. A cell they
 * disagreed on carries no verdict at all, and no derived sentence counts one -
 * neither as a result nor in a denominator.
 *
 * The directory is legitimately empty - a fresh clone carries no measurement -
 * so every consumer has to render that case. A file whose schema version this
 * reader does not know fails the build instead of being skipped: its fields may
 * have changed meaning, and a page that silently drops a profile is worse than
 * one that refuses to build.
 */

/** Schema version this reader understands; anything else is refused. */
const SUPPORTED_SCHEMA_VERSION = 6;

/**
 * Arms that stand as a reference ceiling rather than as a peer.
 *
 * Rapier is a Rust/WASM engine, so a gap against it measures what leaving
 * JavaScript buys and not how two JavaScript solvers compare. The run discloses
 * the same role in its caveats; the split is repeated here because the headline
 * sentences have to make the distinction before a reader reaches them.
 */
const WASM_REFERENCE_ARMS: readonly string[] = ['rapier'];

/** Rendering backend a block was measured on. */
export type ProfileBackendName = 'webgl2' | 'webgpu';

/** Which arm a cell's comparison favours. */
export type VerdictSide = 'exojs' | 'competitor' | 'neither';

/** One computed comparison of two medians, as the harness placed it on its ladder. */
export interface ProfileVerdict {
  readonly side: VerdictSide;
  /** `exojs / competitor`; `null` when the pair produced no comparable ratio. */
  readonly ratio: number | null;
  /** How many times faster the leading arm is; `null` when neither arm produced a number. */
  readonly factor: number | null;
  /** The ladder's own word for this outcome. */
  readonly label: string;
  /** True when the gap is wide enough to be attributed to structure rather than to measurement conditions. */
  readonly structural: boolean;
}

/** How far one measured value moved across the runs a profile pools. */
export interface ProfileSpread {
  readonly minMs: number | null;
  readonly maxMs: number | null;
  /** `maxMs / minMs`: the measurement's own noise, as a factor. */
  readonly ratio: number | null;
}

/** What the pooled runs agreed and disagreed on for one arm pair. */
export interface ProfileAggregate {
  /** How many runs produced a comparable cell here. */
  readonly runs: number;
  readonly reference: ProfileSpread;
  readonly competitor: ProfileSpread;
  /** False when the runs reached different verdicts; the cell then carries none. */
  readonly stable: boolean;
  /** The ladder rung each run produced, in run order. */
  readonly rungs: readonly string[];
}

/**
 * One competitor's outcome on one row.
 *
 * Each arm carries two times. The median is the field-comparable number and the
 * only one a verdict is drawn from; the p95 of the same timed window is the step
 * or frame a player feels, so a pair far apart hitches even where the median
 * reads as comfortable.
 */
export interface ProfileCell {
  readonly competitor: string;
  /** Median of the per-run medians. */
  readonly referenceMs: number | null;
  /** Median of the per-run p95s. */
  readonly referenceP95Ms: number | null;
  /** True when `referenceMs` is past a whole 60 fps frame; see `FRAME_BUDGET_MS`. */
  readonly referenceOverFrameBudget: boolean;
  /** Median of the per-run medians. */
  readonly competitorMs: number | null;
  /** Median of the per-run p95s. */
  readonly competitorP95Ms: number | null;
  /** True when `competitorMs` is past a whole 60 fps frame; see `FRAME_BUDGET_MS`. */
  readonly competitorOverFrameBudget: boolean;
  readonly verdict: ProfileVerdict;
  /** Structural evidence behind the difference, or `null` when the counters carry none. */
  readonly mechanism: string | null;
  /** Spread and stability of the numbers above. */
  readonly aggregate: ProfileAggregate;
}

/**
 * One published row: an archetype at the count it was measured at.
 *
 * A rendering row carries its block's single node count. A physics row carries
 * its own body count, because the physics archetypes have per-archetype ladders -
 * so two physics rows are never comparable with each other, only the arms within
 * one row are.
 */
export interface ProfileRow {
  readonly archetype: string;
  readonly category: string;
  readonly count: number;
  readonly cells: readonly ProfileCell[];
}

/** A category section of a published table. */
export interface ProfileSection {
  readonly title: string;
  readonly rows: readonly ProfileRow[];
}

/** A row that was measured but kept out of the table, with the reason. */
export interface ProfileExcluded {
  readonly archetype: string;
  readonly reason: string;
}

/** One backend's published comparison. */
export interface ProfileBackend {
  readonly backend: ProfileBackendName;
  readonly headlineCount: number | null;
  readonly competitors: readonly string[];
  readonly sections: readonly ProfileSection[];
  readonly excluded: readonly ProfileExcluded[];
  /** CPU-time-only rows against WebGL1 arms, which report no structural counters. */
  readonly webgl1: readonly ProfileRow[];
}

/** One installed arm and the version that produced its numbers. */
export interface ProfileLibrary {
  readonly name: string;
  readonly version: string;
}

/** How a run's pre-release status was established. */
export type PrereleaseSource = 'detected' | 'declared' | 'assumed-stable';

/**
 * Whether a run was taken on a pre-release platform.
 *
 * `assumed-stable` records that nothing established the platform's status and
 * is a weaker statement than a stable platform, not the same one.
 */
export interface PrereleaseStamp {
  readonly value: boolean;
  readonly source: PrereleaseSource;
  readonly evidence: string;
}

/** How a platform's major version was arrived at. */
export type PlatformVersionSource = 'detected' | 'declared' | 'undetermined';

/**
 * The operating system's major version, and what that value rests on.
 *
 * `declared` marks a version the runner stated rather than one the host
 * reported, which is the only source available where the kernel version does
 * not name the product version.
 */
export interface PlatformVersionStamp {
  readonly major: number;
  readonly source: PlatformVersionSource;
  readonly evidence: string;
}

/** Rendering provenance for one backend. */
export interface RenderingStamp {
  readonly backend: ProfileBackendName;
  readonly adapter: string;
  /** Browser engine the run was measured in. */
  readonly browser: string;
  /** Browser build the run was measured in. */
  readonly browserVersion: string;
  /** Operating system of the host that drove the browser. */
  readonly os: string;
  /** The operating system's major version, and what established it. */
  readonly platformVersion: PlatformVersionStamp;
  /** Whether the platform is a pre-release build, and what established that. */
  readonly prerelease: PrereleaseStamp;
  /** Launch flags the run used; empty under a browser that takes none. */
  readonly flags: readonly string[];
  readonly headless: boolean;
  readonly software: boolean;
  readonly slotTier?: number;
  readonly engineVersion: string;
  readonly timestamp: string;
}

/** CPU host the physics numbers were measured on. */
export interface ProfileHost {
  readonly cpu: string;
  readonly cpuCount: number;
  readonly os: string;
  readonly platformVersion: PlatformVersionStamp;
  readonly arch: string;
}

/** What the measuring page's clock could resolve, which decides how finely a step is timed. */
export interface PhysicsClock {
  /** Smallest non-zero `performance.now()` difference the page observed, in milliseconds. */
  readonly resolutionMs: number;
  /** Whether the page reached a cross-origin-isolated context, which lifts the coarse clamp. */
  readonly crossOriginIsolated: boolean;
}

/** Physics provenance; physics has no backend axis, so there is one stamp. */
export interface PhysicsStamp {
  /** Browser engine the step times were measured in. */
  readonly browser: string;
  /** Browser build the step times were measured in. */
  readonly browserVersion: string;
  readonly host: ProfileHost;
  /** Whether the platform is a pre-release build, and what established that. */
  readonly prerelease: PrereleaseStamp;
  readonly fixedDelta: number;
  readonly clock: PhysicsClock;
  readonly caveats: readonly string[];
  readonly engineVersion: string;
  readonly timestamp: string;
}

/** One pooled rendering run's provenance. */
export interface RenderingRun {
  readonly provenance: readonly RenderingStamp[];
}

/** The rendering half of a document. */
export interface RenderingProfile {
  /** One entry per pooled run, in the order they were measured. */
  readonly runs: readonly RenderingRun[];
  readonly libraries: readonly ProfileLibrary[];
  readonly backends: readonly ProfileBackend[];
}

/** The physics half of a document. */
export interface PhysicsProfile {
  /** One stamp per pooled run, in the order they were measured. */
  readonly runs: readonly PhysicsStamp[];
  readonly libraries: readonly ProfileLibrary[];
  readonly section: ProfileSection;
}

/** The operating system a profile was measured on, spelled out behind the slug's OS part. */
export interface ProfilePlatform {
  /** Normalized name, e.g. `windows`, `macos`, `linux`. */
  readonly name: string;
  /** Major version, e.g. 11 for Windows 11 or 27 for macOS 27. */
  readonly version: number;
  /** Whether the version was read from the host or stated by the runner. */
  readonly versionSource: 'detected' | 'declared';
  /** True when the platform is a pre-release build. */
  readonly prerelease: boolean;
}

/** The machine a document describes. */
export interface BenchProfile {
  readonly slug: string;
  /** The GPU the adapter string names, or the CPU model when no adapter names a machine. */
  readonly gpu: string;
  /** The slug's operating-system part: name, major version, and `-beta` for a pre-release build. */
  readonly os: string;
  readonly browser: string;
  /** The operating system behind `os`, in parts. */
  readonly platform: ProfilePlatform;
  readonly engineVersion: string;
  readonly measuredAt: string;
  /** How many separate harness runs every measured domain pools. */
  readonly runs: number;
}

/** Integrity cover the harness wrote over the document. */
export interface ProfileSignature {
  readonly algorithm: string;
  readonly value: string;
}

/**
 * A published machine-profile document.
 *
 * A domain is absent when the profile was written from a run that did not cover
 * it, and a missing domain means "not measured on this machine" - never zero.
 */
export interface BenchProfileDocument {
  readonly schemaVersion: number;
  readonly profile: BenchProfile;
  readonly rendering?: RenderingProfile;
  readonly physics?: PhysicsProfile;
  readonly signature: ProfileSignature;
}

const documents = import.meta.glob('../../../packages/exojs-bench/results/*.json', { eager: true, import: 'default' }) as Readonly<
  Record<string, BenchProfileDocument>
>;

/** Compare two dotted version strings, newest first. */
const byVersionDescending = (a: string, b: string): number => {
  const left = a.split('.');
  const right = b.split('.');

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = Number.parseInt(left[index] ?? '0', 10);
    const r = Number.parseInt(right[index] ?? '0', 10);

    if (Number.isNaN(l) || Number.isNaN(r)) return b.localeCompare(a);
    if (l !== r) return r - l;
  }

  return 0;
};

/** Newest engine version first, then newest measurement first. */
const byRecency = (a: BenchProfileDocument, b: BenchProfileDocument): number =>
  byVersionDescending(a.profile.engineVersion, b.profile.engineVersion) || b.profile.measuredAt.localeCompare(a.profile.measuredAt);

const loaded = Object.entries(documents)
  .map(([path, document]) => {
    if (document.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(
        `Benchmark profile '${path}' declares schema version ${String(document.schemaVersion)}, but this site reads version ${String(SUPPORTED_SCHEMA_VERSION)}.`,
      );
    }

    return document;
  })
  .sort(byRecency);

/** Every published profile, newest engine version first and newest measurement first within a version. */
export const benchProfiles: readonly BenchProfileDocument[] = loaded;

/** The profile the page leads with, or `undefined` when nothing has been published yet. */
export const referenceProfile: BenchProfileDocument | undefined = loaded[0];

/** Every profile except the reference one, in the same order. Empty until a second machine is contributed. */
export const furtherProfiles: readonly BenchProfileDocument[] = loaded.slice(1);

/** Display name for a rendering backend. */
export const BACKEND_LABELS: Readonly<Record<ProfileBackendName, string>> = { webgl2: 'WebGL2', webgpu: 'WebGPU' };

/**
 * Spread factor at which a measurement's own noise is called out.
 *
 * The verdict ladder treats a ratio up to 1.2 between two arms as
 * indistinguishable from machine mood. A value whose own runs moved by that
 * much is therefore as noisy as the band that decides its verdict, which is the
 * point at which the reader has to know before reading the number. The
 * threshold is the ladder's, not a second opinion about what counts as noisy.
 */
export const WIDE_SPREAD_RATIO = 1.2;

/**
 * One 60 fps frame, in milliseconds - the line past which a published value is
 * marked as unplayable.
 *
 * It is the whole frame and not a fraction of it. How much of a frame a reader
 * may spend on physics, or on the CPU side of rendering, depends on everything
 * else their frame does and is their decision; a single step or frame that costs
 * more than the frame it has to fit in is beyond rescue whatever they decide.
 * The value the harness marks against is stored per cell in the profile, and
 * this constant only spells the threshold out in the page's own prose.
 */
export const FRAME_BUDGET_MS = 16.7;

/** A ratio in the form the verdict labels print it, or a dash when the pair produced none. */
export const formatFactor = (factor: number | null): string => (factor === null || !Number.isFinite(factor) ? '-' : `${factor.toFixed(2)}x`);

/** A median in milliseconds, or a dash when the arm produced no comparable number. */
export const formatMs = (ms: number | null): string => (ms === null || !Number.isFinite(ms) ? '-' : ms.toFixed(3));

/** An ISO timestamp reduced to a calendar day. */
export const formatDay = (timestamp: string): string => timestamp.slice(0, 10);

/**
 * An ISO timestamp reduced to the day and minute, in UTC.
 *
 * Runs pooled into one profile are usually minutes apart, so a day alone would
 * print the same value three times and hide that they are separate runs.
 */
export const formatRunTime = (timestamp: string): string => `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} UTC`;

/** True when both ends of a spread were observed, so a range can be printed for it. */
export const hasSpread = (spread: ProfileSpread): boolean =>
  spread.minMs !== null && spread.maxMs !== null && Number.isFinite(spread.minMs) && Number.isFinite(spread.maxMs);

/** The observed range behind a pooled median, or an empty string when no run produced one. */
export const formatRange = (spread: ProfileSpread): string => (hasSpread(spread) ? `${formatMs(spread.minMs)}-${formatMs(spread.maxMs)}` : '');

/** True when the runs behind a value moved by at least {@link WIDE_SPREAD_RATIO}. */
export const isWideSpread = (spread: ProfileSpread): boolean => spread.ratio !== null && Number.isFinite(spread.ratio) && spread.ratio >= WIDE_SPREAD_RATIO;

/**
 * The word each ladder rung is printed with.
 *
 * An unstable cell publishes no verdict, so what its runs individually
 * concluded is the only evidence a reader has for how far apart they landed;
 * printing the raw rung ids would make that evidence unreadable.
 */
const RUNG_LABELS: Readonly<Record<string, string>> = {
  'not-comparable': 'not comparable',
  level: 'level',
  'exojs-leads': 'ExoJS leads',
  'exojs-leads-clearly': 'ExoJS leads clearly',
  'competitor-leads': 'the arm leads',
  'competitor-leads-clearly': 'the arm leads clearly',
};

/** What each run concluded, in run order, as a readable list. */
export const describeRungs = (rungs: readonly string[]): string =>
  rungs.map((rung, index) => `run ${String(index + 1)}: ${RUNG_LABELS[rung] ?? rung}`).join(', ');

/** True when this arm stands as a reference ceiling rather than as a peer. */
export const isWasmReferenceArm = (competitor: string): boolean => WASM_REFERENCE_ARMS.includes(competitor);

/**
 * The engine version of the newest published profile when `document` was
 * measured with an older one, otherwise `null` - the note a collapsed further
 * machine carries so its numbers are not read as current.
 */
export const olderThanReference = (document: BenchProfileDocument): string | null => {
  const newest = referenceProfile?.profile.engineVersion;

  return newest !== undefined && byVersionDescending(document.profile.engineVersion, newest) > 0 ? newest : null;
};

/** Arms a table has a column for, derived from the cells so an arm that produced nothing anywhere is not invented. */
export const armsOfSection = (section: ProfileSection): readonly string[] =>
  [...new Set(section.rows.flatMap(row => row.cells.map(cell => cell.competitor)))].sort();

/** One cell flattened onto its row, so a single comparison can be reasoned about on its own. */
interface FlatCell {
  readonly backend: ProfileBackendName | null;
  readonly archetype: string;
  readonly count: number;
  readonly cell: ProfileCell;
}

/**
 * Every rendering cell of the main tables.
 *
 * The WebGL1 block is deliberately left out. Those arms report no structural
 * counters, so their rows are an observation about a different backend
 * generation rather than a finding, and the scope sentence must not count one.
 */
const renderingCells = (document: BenchProfileDocument): readonly FlatCell[] =>
  (document.rendering?.backends ?? []).flatMap(backend =>
    backend.sections.flatMap(section =>
      section.rows.flatMap(row => row.cells.map(cell => ({ backend: backend.backend, archetype: row.archetype, count: row.count, cell }))),
    ),
  );

/** Every physics cell of the published table. */
const physicsCells = (document: BenchProfileDocument): readonly FlatCell[] =>
  (document.physics?.section.rows ?? []).flatMap(row => row.cells.map(cell => ({ backend: null, archetype: row.archetype, count: row.count, cell })));

/** Distinct arm names in a set of cells, alphabetically. */
const armsIn = (cells: readonly FlatCell[]): readonly string[] => [...new Set(cells.map(entry => entry.cell.competitor))].sort();

/** An English list: `a`, `a and b`, `a, b and c`. */
const listOf = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`);

/**
 * How one comparison reads once the pooled runs are taken into account.
 *
 * `clear-lead` and `clear-loss` are the ladder's own "leads clearly" rungs, kept
 * apart from the ordinary ones so a scoreboard can show at a glance how much of
 * a mix is attributable to structure. `unstable` is not a sixth verdict but the
 * absence of one: the runs reached different rungs, so the pair carries numbers
 * and no conclusion. `absent` is an arm that produced no comparable cell at all.
 */
export type CellOutcome = 'clear-lead' | 'lead' | 'level' | 'loss' | 'clear-loss' | 'unstable' | 'absent';

/** Outcomes in reading order: the widest lead first, the widest loss last, then the two that carry no verdict. */
export const OUTCOME_ORDER: readonly CellOutcome[] = ['clear-lead', 'lead', 'level', 'loss', 'clear-loss', 'unstable', 'absent'];

/** The word a scoreboard and a legend print for each outcome. */
export const OUTCOME_LABELS: Readonly<Record<CellOutcome, string>> = {
  'clear-lead': 'clear lead',
  lead: 'lead',
  level: 'level',
  loss: 'loss',
  'clear-loss': 'clear loss',
  unstable: 'runs disagreed',
  absent: 'not comparable',
};

/**
 * Which outcome a cell publishes.
 *
 * This is the only place a comparison is turned into one of the seven words, so
 * no table or scoreboard can invent an outcome for a cell whose runs did not
 * agree on one.
 */
export const outcomeOf = (cell: ProfileCell | null): CellOutcome => {
  if (cell === null) return 'absent';
  if (!cell.aggregate.stable) return 'unstable';
  if (cell.verdict.side === 'neither') return 'level';
  if (cell.verdict.side === 'exojs') return cell.verdict.structural ? 'clear-lead' : 'lead';

  return cell.verdict.structural ? 'clear-loss' : 'loss';
};

/** The lowest and highest `exojs / competitor` ratio the pooled runs can have produced. */
export interface RatioBand {
  readonly low: number;
  readonly high: number;
}

/**
 * The ratio band behind a comparison whose runs disagreed.
 *
 * This is the one figure the page derives rather than reads: a cell the runs
 * split on carries no published ratio, and printing nothing in its place would
 * throw away measurements that exist. The band is the widest and narrowest
 * ratio the observed extremes allow, so it is an envelope around what was
 * measured and never a verdict - it is drawn without a side, and a band that
 * straddles 1.00 is exactly the statement that the runs could not separate the
 * pair. It returns `null` where an arm reported no extremes to bound.
 */
export const ratioBand = (cell: ProfileCell): RatioBand | null => {
  const { reference, competitor } = cell.aggregate;

  if (reference.minMs === null || reference.maxMs === null || competitor.minMs === null || competitor.maxMs === null) return null;
  if (competitor.minMs <= 0 || competitor.maxMs <= 0) return null;

  return { low: reference.minMs / competitor.maxMs, high: reference.maxMs / competitor.minMs };
};

/** A ratio band as the scoreboard and the tables print it. */
export const formatBand = (band: RatioBand): string => `${band.low.toFixed(2)}-${band.high.toFixed(2)}`;

/** One scoreboard line: everything measured against one arm, on one backend or in physics. */
export interface ComparisonTally {
  readonly key: string;
  /** The pair, as the scoreboard names it. */
  readonly label: string;
  /** What the pair is measured at, or what role the arm stands in. */
  readonly meta: string;
  readonly counts: Readonly<Record<CellOutcome, number>>;
  readonly total: number;
}

const tally = (key: string, label: string, meta: string, cells: readonly (ProfileCell | null)[]): ComparisonTally => {
  const counts = Object.fromEntries(OUTCOME_ORDER.map(outcome => [outcome, 0])) as Record<CellOutcome, number>;

  for (const cell of cells) counts[outcomeOf(cell)] += 1;

  return { key, label, meta, counts, total: cells.length };
};

/**
 * The scoreboard, one line per arm a domain was measured against.
 *
 * The split is per arm and never per backend: a backend line would pool two
 * different opponents into one strip, so a reader would see a mix that belongs
 * to neither of them. Nothing is summed across lines and no line is ranked
 * against another, because the arms answer different questions.
 */
export const comparisonTallies = (document: BenchProfileDocument): readonly ComparisonTally[] => [
  ...(document.rendering?.backends ?? []).flatMap(backend =>
    backend.competitors.map(arm =>
      tally(
        `${backend.backend}-${arm}`,
        `${BACKEND_LABELS[backend.backend]} vs ${arm}`,
        backend.headlineCount === null ? 'no headline count' : `${String(backend.headlineCount)} nodes`,
        backend.sections.flatMap(section => section.rows.map(row => row.cells.find(cell => cell.competitor === arm) ?? null)),
      ),
    ),
  ),
  ...(document.physics === undefined
    ? []
    : armsOfSection(document.physics.section).map(arm =>
        tally(
          `physics-${arm}`,
          `Physics vs ${arm}`,
          isWasmReferenceArm(arm) ? 'Rust/WASM ceiling' : 'pure-JS peer',
          (document.physics?.section.rows ?? []).map(row => row.cells.find(cell => cell.competitor === arm) ?? null),
        ),
      )),
];

/**
 * The sentence under the page title: which machine was measured, with which
 * engine version, over how many runs, and how much the profile covers.
 *
 * Every value in it is copied from the document, so a re-measurement rewrites
 * the sentence with the tables rather than leaving a claim behind that the
 * numbers no longer support. A profile carrying only one domain yields a
 * shorter sentence instead of a padded one.
 */
export const profileScope = (document: BenchProfileDocument): string => {
  const rendering = renderingCells(document);
  const physics = physicsCells(document);
  const { profile } = document;
  const parts: string[] = [];

  if (rendering.length > 0) {
    const backends = (document.rendering?.backends ?? []).map(backend => BACKEND_LABELS[backend.backend]);

    parts.push(`${String(rendering.length)} rendering comparisons on ${listOf(backends)} against ${listOf(armsIn(rendering))}`);
  }

  if (physics.length > 0) {
    parts.push(`${String(physics.length)} physics comparisons against ${listOf(armsIn(physics))}`);
  }

  if (parts.length === 0) return '';

  return `ExoJS ${profile.engineVersion} on ${profile.gpu} / ${profile.os} / ${profile.browser}, pooled from ${String(profile.runs)} separate runs taken on ${formatDay(profile.measuredAt)}: ${parts.join('; ')}.`;
};
