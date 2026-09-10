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
const SUPPORTED_SCHEMA_VERSIONS = new Set([6, 7]);

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
  /** GPU frame median when the published rendering run exposed a hardware timer. */
  readonly referenceGpuMs?: number | null;
  /** True when `referenceMs` is past a whole 60 fps frame; see `FRAME_BUDGET_MS`. */
  readonly referenceOverFrameBudget: boolean;
  /** Median of the per-run medians. */
  readonly competitorMs: number | null;
  /** Median of the per-run p95s. */
  readonly competitorP95Ms: number | null;
  /** GPU frame median when the published rendering run exposed a hardware timer. */
  readonly competitorGpuMs?: number | null;
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

/** How many of the two measured domains a profile carries. */
const domainCount = (document: BenchProfileDocument): number => (document.rendering === undefined ? 0 : 1) + (document.physics === undefined ? 0 : 1);

/**
 * Newest engine version first, then widest coverage, then newest measurement.
 *
 * Coverage outranks the measurement date because the first profile leads the
 * page: a partial run finished an hour later than a complete one would
 * otherwise bury a whole domain in the collapsed list below, and the page would
 * silently stop showing measurements it holds.
 */
const byRecency = (a: BenchProfileDocument, b: BenchProfileDocument): number =>
  byVersionDescending(a.profile.engineVersion, b.profile.engineVersion) ||
  domainCount(b) - domainCount(a) ||
  b.profile.measuredAt.localeCompare(a.profile.measuredAt);

const loaded = Object.entries(documents)
  .map(([path, document]) => {
    if (!SUPPORTED_SCHEMA_VERSIONS.has(document.schemaVersion)) {
      throw new Error(`Benchmark profile '${path}' declares unsupported schema version ${String(document.schemaVersion)}.`);
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
 * How each arm is written where a reader sees it.
 *
 * The profile stores the harness's own package slugs, which are the right
 * identifier inside the repository and the wrong one on a published page: a
 * comparison against `matter-js` is a comparison against Matter.js. An arm with
 * no entry keeps its slug rather than being guessed at, so adding one to the
 * harness never silently renames it here.
 */
const ARM_LABELS: Readonly<Record<string, string>> = {
  pixi: 'PixiJS',
  excalibur: 'Excalibur',
  phaser: 'Phaser',
  'matter-js': 'Matter.js',
  planck: 'Planck',
  rapier: 'Rapier',
};

/** An arm's published name, or its slug where none is known. */
export const armLabel = (arm: string): string => ARM_LABELS[arm] ?? arm;

/**
 * What each archetype's workload is, in one line.
 *
 * These live with the page rather than in a profile: they are prose for a
 * reader, identical on every machine, and a measurement artifact that carried
 * them would repeat them per run and let two published profiles disagree about
 * what the same archetype means. The archetype id is the contract between the
 * harness and this page; an id with no line here simply prints without one.
 */
const ARCHETYPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'static-heavy': 'Mostly unchanged sprites; stresses retained scene reuse.',
  'dynamic-heavy': 'A lightly mutating sprite field; stresses transform and update work.',
  'deep-hierarchy': 'Deep parent-child nesting; stresses world-transform propagation.',
  overdraw: 'Full-viewport sprites; stresses fragment fill and overdraw.',
  'batch-breaking': 'Many texture changes; stresses batch breaks and state submission.',
  'batch-breaking-atlased': 'Atlased texture changes; isolates batching without texture uploads.',
  'split-screen': 'Several simultaneous views; stresses multi-viewport traversal.',
  'mixed-blend': 'Long runs of blend modes; stresses state changes and batching.',
  'mixed-material': 'Several custom materials; stresses shader/material switches.',
  'mixed-material-atlased': 'Custom materials over atlased sprites; combines material and texture variety.',
  'instanced-batch': 'Explicit instance batches; stresses immediate submission cost.',
  'mixed-sprite-mesh-array': 'Sprites interleaved with mesh-array leaves; stresses renderer path switches.',
  'mixed-sprite-mesh-static': 'Sprites interleaved with static meshes; stresses mixed draw paths.',
  'scrolling-world': 'A moving camera over mostly off-screen content; stresses culling and retained reuse.',
  'text-static': 'Static labels with repeated glyphs; stresses text layout and glyph generation.',
  'text-dynamic': 'Changing labels; stresses per-frame text invalidation and layout.',
  'lifecycle-churn': 'A small fraction of leaves rebuilt each frame; stresses resource lifecycle work.',
  'filter-chain-1': 'One filter pass per scene; stresses offscreen composition.',
  'filter-chain-2': 'Two filter passes per scene; stresses chained offscreen composition.',
  'filter-chain-4': 'Four filter passes per scene; stresses deep filter composition.',
  'mask-clip': 'Clipped content; stresses mask setup and compositing.',
  'mask-clip-animated': 'Animated clipped content; stresses mask invalidation.',
  composite: 'Nested render targets; stresses multi-pass composition.',
  'box-stack': 'Dense resting contacts; stresses collision detection, solving and sleeping.',
  'many-dynamic': 'Many active bodies in a bounded field; stresses broad-phase and live contacts.',
  'mixed-static-dynamic': 'Dynamic bodies falling onto static level geometry; models a common game mix.',
  raycast: 'A mixed scene plus repeated rays; isolates query throughput.',
  'body-churn': 'Bodies rebuilt every step; stresses broad-phase repair and lifecycle work.',
  joints: 'Constraint chains; stresses impulse propagation through joints.',
  'settling-pile': 'A dissipating pile; exposes steady-state settling and sleeping behavior.',
};

/** The one-line workload description for an archetype, or `undefined` where none is written. */
export const archetypeDescription = (archetype: string): string | undefined => ARCHETYPE_DESCRIPTIONS[archetype];

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

/**
 * True when the pair produced a comparison at all.
 *
 * A pair the harness could not compare - an arm that does not implement the
 * archetype, or that reported nothing there - carries neither a ratio nor a
 * factor.
 */
export const isComparable = (cell: ProfileCell): boolean => cell.verdict.ratio !== null || cell.verdict.factor !== null;

/**
 * One arm's measurement inside a cell, or `null` where that arm produced none.
 *
 * An arm that sat a comparison out is stored as a zero rather than as a missing
 * value, so a reader would otherwise be shown `0.000 ms` - the fastest number on
 * the page - for the arm that did not run.
 */
export const measuredMs = (cell: ProfileCell, ms: number | null): number | null => (!isComparable(cell) && ms === 0 ? null : ms);

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

/** Which way one run's rung fell, for showing the pooled runs as marks rather than as a sentence. */
export type RungSide = 'exojs' | 'neither' | 'competitor';

/**
 * The side a single run landed on.
 *
 * The profile records the rung each run reached but not the median behind it,
 * so a run can be placed on a side and never on an axis. Four marks that all
 * sit together and four that straddle the middle are different measurements
 * with the same printed range, which is the whole reason to show them.
 */
export const rungSide = (rung: string): RungSide => {
  if (rung.startsWith('exojs-leads')) return 'exojs';
  if (rung.startsWith('competitor-leads')) return 'competitor';

  return 'neither';
};

/**
 * How much of a whole 60 fps frame one published time takes.
 *
 * A millisecond figure is only meaningful against the frame it has to fit in,
 * and that is the comparison a reader without a benchmarking habit makes
 * anyway. Nothing is derived from it: no verdict, no capacity figure, no
 * ranking - it restates a published time against {@link FRAME_BUDGET_MS}.
 */
export const frameShare = (ms: number | null): number | null => (ms === null || !Number.isFinite(ms) ? null : (ms / FRAME_BUDGET_MS) * 100);

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

/** The word a summary and a legend print for each outcome. */
export const OUTCOME_LABELS: Readonly<Record<CellOutcome, string>> = {
  'clear-lead': 'clear lead',
  lead: 'lead',
  level: 'level',
  loss: 'loss',
  'clear-loss': 'clear loss',
  unstable: 'no clear lead',
  absent: 'no shared cell',
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
 * This is the one figure the page derives rather than reads. A cell the runs
 * split on carries no published ratio, and printing nothing in its place would
 * throw away measurements that exist - but printing a single figure would
 * invent the point verdict the runs failed to reach. The band is the widest and
 * narrowest ratio the observed extremes allow: an envelope around what was
 * measured, drawn without a side, and a band that straddles 1.00 is exactly the
 * statement that the runs landed on both sides of the decision point. Returns
 * `null` where an arm reported no extremes to bound.
 */
export const ratioBand = (cell: ProfileCell): RatioBand | null => {
  const { reference, competitor } = cell.aggregate;

  if (reference.minMs === null || reference.maxMs === null || competitor.minMs === null || competitor.maxMs === null) return null;
  if (competitor.minMs <= 0 || competitor.maxMs <= 0) return null;

  return { low: reference.minMs / competitor.maxMs, high: reference.maxMs / competitor.minMs };
};

/** A ratio band as the details print it. */
export const formatBand = (band: RatioBand): string => `${band.low.toFixed(2)}x-${band.high.toFixed(2)}x`;

/**
 * The factor a pair's two pooled medians work out to.
 *
 * A cell whose runs landed on different rungs publishes no verdict, but its two
 * medians are published and are the pair's central observation. It is printed
 * with a tilde and without a side: it says how far apart the arms sit, not
 * which one is faster, because that is precisely what the runs disagreed on.
 * It is deliberately not the middle of the observed band - averaging two ratios
 * is not a ratio anyone measured.
 */
export const pooledFactor = (cell: ProfileCell): number | null => {
  const { referenceMs, competitorMs } = cell;

  if (referenceMs === null || competitorMs === null || referenceMs <= 0 || competitorMs <= 0) return null;

  const ratio = referenceMs / competitorMs;

  return ratio < 1 ? 1 / ratio : ratio;
};

/** A factor the runs did not settle, marked as such. */
export const formatApproximate = (factor: number): string => `~${factor.toFixed(2)}x`;

/** How far the pooled runs moved, as the single factor the profile stores. */
export const formatSpread = (spread: ProfileSpread): string => (spread.ratio === null || !Number.isFinite(spread.ratio) ? '' : `${spread.ratio.toFixed(2)}x`);

/**
 * What a measured comparison came out as, once the ladder's five settled rungs
 * are collapsed to the three directions a summary needs.
 *
 * `mixed` is a measured outcome, not a missing one: the runs produced numbers
 * and landed on different rungs. A pair with no shared cell has no state at all
 * and is counted as coverage instead - an arm that sat an archetype out is not
 * a fifth performance direction, and folding the two together would report a
 * gap in the matrix as a doubt about the measurement.
 */
export type SummaryState = 'ahead' | 'level' | 'behind' | 'unclear';

/** Which summary state an outcome falls into, or `null` where no pair was measured. */
export const SUMMARY_OF: Readonly<Record<CellOutcome, SummaryState | null>> = {
  'clear-lead': 'ahead',
  lead: 'ahead',
  level: 'level',
  loss: 'behind',
  'clear-loss': 'behind',
  unstable: 'unclear',
  absent: null,
};

/** Summary states in reading order. */
export const SUMMARY_ORDER: readonly SummaryState[] = ['ahead', 'level', 'behind', 'unclear'];

/** One summary line: everything measured against one arm, on one backend or in physics. */
export interface ComparisonTally {
  readonly key: string;
  /** Heading this pair sits under, so peers and a reference arm are not read as the same kind of opponent. */
  readonly group: string;
  /** The pair, as the summary names it. */
  readonly label: string;
  /** The arm on its own, for a sentence that has to name it. */
  readonly arm: string;
  /** What the pair is measured at, or what role the arm stands in. */
  readonly meta: string;
  readonly counts: Readonly<Record<CellOutcome, number>>;
  /** The measured comparisons, rolled up to the states the summary shows. */
  readonly summary: Readonly<Record<SummaryState, number>>;
  /** How many rows produced a comparison at all; the rest of `total` is coverage the matrix does not have. */
  readonly measured: number;
  readonly total: number;
}

const tally = (key: string, group: string, label: string, arm: string, meta: string, cells: readonly (ProfileCell | null)[]): ComparisonTally => {
  const counts = Object.fromEntries(OUTCOME_ORDER.map(outcome => [outcome, 0])) as Record<CellOutcome, number>;
  const summary = Object.fromEntries(SUMMARY_ORDER.map(state => [state, 0])) as Record<SummaryState, number>;

  let measured = 0;

  for (const cell of cells) {
    const outcome = outcomeOf(cell);
    const state = SUMMARY_OF[outcome];

    counts[outcome] += 1;

    if (state !== null) {
      summary[state] += 1;
      measured += 1;
    }
  }

  return { key, group, label, arm, meta, counts, summary, measured, total: cells.length };
};

/** Which measured domain a view is showing. */
export type BenchDomain = 'rendering' | 'physics';

/**
 * The scoreboard, one line per arm a domain was measured against.
 *
 * The split is per arm and never per backend: a backend line would pool two
 * different opponents into one strip, so a reader would see a mix that belongs
 * to neither of them. Nothing is summed across lines and no line is ranked
 * against another, because the arms answer different questions.
 *
 * Pass `domain` to keep the lines of one domain only; without it the document's
 * whole scoreboard is returned.
 */
export const comparisonTallies = (document: BenchProfileDocument, domain?: BenchDomain): readonly ComparisonTally[] => [
  ...(domain === 'physics' ? [] : (document.rendering?.backends ?? [])).flatMap(backend =>
    backend.competitors.map(arm =>
      tally(
        `${backend.backend}-${arm}`,
        `Rendering · ${BACKEND_LABELS[backend.backend]}`,
        `vs ${armLabel(arm)}`,
        armLabel(arm),
        backend.headlineCount === null ? 'no headline count' : `${String(backend.headlineCount)} nodes`,
        backend.sections.flatMap(section => section.rows.map(row => row.cells.find(cell => cell.competitor === arm) ?? null)),
      ),
    ),
  ),
  ...(document.physics === undefined || domain === 'rendering'
    ? []
    : armsOfSection(document.physics.section).map(arm =>
        tally(
          `physics-${arm}`,
          isWasmReferenceArm(arm) ? 'Physics · WASM reference' : 'Physics · JavaScript peers',
          `vs ${armLabel(arm)}`,
          armLabel(arm),
          isWasmReferenceArm(arm) ? 'Rust/WASM solver' : 'JavaScript solver',
          (document.physics?.section.rows ?? []).map(row => row.cells.find(cell => cell.competitor === arm) ?? null),
        ),
      )),
];

/**
 * The one-line stamp under the page title: which machine, which engine version,
 * how many pooled runs, and what the profile covers.
 *
 * Every value is copied from the document, so a re-measurement rewrites the
 * line with the tables rather than leaving a claim behind that the numbers no
 * longer support. A profile carrying only one domain yields a shorter line
 * instead of a padded one.
 */
export const profileScope = (document: BenchProfileDocument, domain?: BenchDomain): string => {
  const rendering = domain === 'physics' ? [] : renderingCells(document);
  const physics = domain === 'rendering' ? [] : physicsCells(document);
  const parts: string[] = [];

  if (rendering.length > 0) parts.push(`${String(rendering.length)} rendering comparisons against ${listOf(armsIn(rendering).map(armLabel))}`);
  if (physics.length > 0) parts.push(`${String(physics.length)} physics comparisons against ${listOf(armsIn(physics).map(armLabel))}`);

  return parts.join(' · ');
};

/** True when the profile carries measurements for this domain. */
export const coversDomain = (document: BenchProfileDocument, domain: BenchDomain): boolean =>
  domain === 'rendering' ? document.rendering !== undefined : document.physics !== undefined;
